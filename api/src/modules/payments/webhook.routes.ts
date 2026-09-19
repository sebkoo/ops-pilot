import { Hono } from 'hono';
import type Stripe from 'stripe';
import { type Txn, withTransaction } from '../../db.js';
import { AppError } from '../../errors.js';
import { recordEvent } from '../issues/event.repo.js';
import { canTransition, type InvoiceStatus } from './invoice.schema.js';
import { stripe, webhookSecret } from './stripe.js';

export const webhookRoutes = new Hono();

// Stripe event type → next invoice status: accept but ignore Events not listed here,
const NEXT_STATUS: Partial<Record<Stripe.Event['type'], InvoiceStatus>> = {
  'payment_intent.succeeded': 'paid',
  'payment_intent.payment_failed': 'failed',
  'charge.refunded': 'refunded',
};

export type WebhookOutcome =
  | 'duplicate'
  | 'ignored'
  | 'unknown-invoice'
  | 'already-final'
  | InvoiceStatus;

// Final states: invoices in these states return `already-final`
// other states are simply ignored.
const FINAL: readonly InvoiceStatus[] = ['paid', 'refunded'];

type LockedInvoice = { id: string; issue_id: string; status: InvoiceStatus };
const LOCK_INVOICE = `SELECT id, issue_id, status FROM invoices WHERE stripe_payment_intent_id = $1 FOR UPDATE`;

// Transaction result: one explicit outcome value,
// plus the invoice only when a state change was actually applied
type Applied = { outcome: WebhookOutcome; invoice?: LockedInvoice };

webhookRoutes.post('/stripe', async (c) => {
  const raw = await c.req.text();
  const signature = c.req.header('stripe-signature');
  if (!signature)
    throw new AppError(400, 'missing_signature', 'The strip-signature header is missing');

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, webhookSecret());
  } catch {
    throw new AppError(400, 'invalid_signature', 'The signature is invalid');
  }
  const applied = await applyStripeEvent(event);
  console.log('stripe webhook', event.type, event.id, applied);

  return c.json({ received: true, applied });
});

// Extract the PaymentIntent ID from a Stripe event.
// `payment_intent.*` events use the event object's own ID
// while `charge.*` events use `charge.payment_intent`.
function paymentIntentId(event: Stripe.Event): string | null {
  switch (event.type) {
    case 'payment_intent.succeeded':
    case 'payment_intent.payment_failed':
      return event.data.object.id;
    case 'charge.refunded': {
      const pi = event.data.object.payment_intent;
      return typeof pi === 'string' ? pi : (pi?.id ?? null);
    }
    default:
      return null;
  }
}

// Runs entirely inside the transaction: no external calls.
// `Txn` makes that contract explicit in the function signature.
async function applyInTransaction(db: Txn, event: Stripe.Event): Promise<Applied> {
  const stamped = await db.query<{ id: string }>(
    `INSERT INTO stripe_events (id, type)
       VALUES ($1, $2)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
    [event.id, event.type],
  );
  if (stamped.rowCount === 0) return { outcome: 'duplicate' };

  const next = NEXT_STATUS[event.type];
  if (!next) return { outcome: 'ignored' };

  const pi = paymentIntentId(event);
  if (!pi) return { outcome: 'unknown-invoice' };

  const invoice = await db.one<LockedInvoice>(LOCK_INVOICE, [pi]);
  if (!invoice) return { outcome: 'unknown-invoice' };
  if (!canTransition(invoice.status, next))
    return {
      outcome: FINAL.includes(invoice.status) ? 'already-final' : 'ignored',
    };
  await db.query(
    `UPDATE invoices 
       SET status = $2, 
        updated_at = now(), 
        version = version + 1 
       WHERE id = $1`,
    [invoice.id, next],
  );
  return { outcome: next, invoice };
}

// Claim the event for deduplication → lock the invoice with FOR UPDATE
// → transition it through the state machine.
// All steps run in a single transaction with no external calls inside the transaction.
export async function applyStripeEvent(event: Stripe.Event): Promise<WebhookOutcome> {
  const result = await withTransaction((db) => applyInTransaction(db, event));
  if (result.invoice && (result.outcome === 'paid' || result.outcome === 'refunded')) {
    await recordEvent(
      result.invoice.issue_id,
      null,
      result.outcome === 'paid' ? 'invoice_paid' : 'invoice_refunded',
      { invoiceId: result.invoice.id, stripeEventId: event.id },
    );
  }
  return result.outcome;
}
