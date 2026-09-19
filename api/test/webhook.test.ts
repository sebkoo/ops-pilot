import type Stripe from 'stripe';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { initConfig } from '../src/config.js';
import { closePool, one, query } from '../src/db.js';
import { useStripeClient } from '../src/modules/payments/stripe.js';
import { FakeStripe, stripeEvent, useTestStripeEnv } from './support/fakeStripe.js';
import {
  bodyOf,
  createResolvedIssue,
  errorCodeOf,
  jsonHeaders,
  registerUser,
  type TestUser,
} from './support/users.js';

const stripe = new FakeStripe();
// One-word outcome from the webhook response
const appliedOf = async (res: Response) => (await bodyOf<{ applied: string }>(res)).applied;

let manager: TestUser;

beforeAll(async () => {
  useTestStripeEnv();
  initConfig();
  useStripeClient(stripe);
  manager = await registerUser(app, 'manager');
});
afterAll(async () => {
  useStripeClient(null);
  await closePool();
});

// Creates an invoice and a PaymentIntent that the webhook can use to find the invoice.
async function processInvoice(): Promise<{
  id: string;
  issueId: string;
  pi: string;
}> {
  const issue = await createResolvedIssue(app, manager);
  const created = await app.request('/invoices', {
    method: 'POST',
    headers: jsonHeaders(manager.token, {
      'idempotency-key': crypto.randomUUID(),
    }),
    body: JSON.stringify({
      issueId: issue.id,
      vendorName: 'ColdFix Inc.',
      amountCents: 9900,
    }),
  });
  const invoice = await bodyOf<{ id: string }>(created);
  await app.request(`/invoices/${invoice.id}/payment-intent`, {
    method: 'POST',
    headers: jsonHeaders(manager.token, {
      'idempotency-key': crypto.randomUUID(),
    }),
    body: '{}',
  });
  const row = await one<{ stripe_payment_intent_id: string }>(
    `SELECT stripe_payment_intent_id
     FROM invoices
     WHERE id = $1`,
    [invoice.id],
  );
  if (!row) throw new Error(`invoice ${invoice.id} not found`);

  return {
    id: invoice.id,
    issueId: issue.id,
    pi: row.stripe_payment_intent_id,
  };
}

const deliver = (payload: string, signature = stripe.sign(payload)) =>
  app.request('/webhooks/stripe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    body: payload,
  });

// One payment_intent event
const piEvent = (type: Stripe.Event.Type, id: string) =>
  stripeEvent(type, { object: 'payment_intent', id });

const invoiceRow = async (id: string) => {
  const row = await one<{
    status: string;
    version: number;
  }>(
    `SELECT status, version
     FROM invoices
     WHERE id = $1`,
    [id],
  );
  if (!row) throw new Error(`invoice ${id} not found`);

  return row;
};

// One-word status: same name and same type as in P.6 `reconcile.test.ts`
const statusOf = async (id: string) => (await invoiceRow(id)).status;

describe('stripe webhook (P.5)', () => {
  it('returns 400 with the signature missing or invalid: accepts genuinely signed requests only', async () => {
    const payload = piEvent('payment_intent.succeeded', 'pi_whatever');
    const missing = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
    });
    expect(missing.status).toBe(400);

    const forged = await deliver(payload, stripe.sign(payload, 'whsec_someone_else'));
    expect(forged.status).toBe(400);
    expect(await errorCodeOf(forged)).toBe('invalid_signature');
  });

  it('paid (version +1, audit event) absorbs duplicates, unknown or irrelevant event returns 200', async () => {
    const invoice = await processInvoice();
    const payload = piEvent('payment_intent.succeeded', invoice.pi);
    const first = await deliver(payload);
    expect(first.status).toBe(200);
    expect(await appliedOf(first)).toBe('paid');

    const after = await invoiceRow(invoice.id);
    expect(after.status).toBe('paid');

    const again = await deliver(payload);
    expect(await appliedOf(again)).toBe('duplicate');
    expect((await invoiceRow(invoice.id)).version).toBe(after.version);

    const events = await query<{ kind: string }>(
      `SELECT kind FROM issue_events 
       WHERE issue_id = $1 AND 
        kind = 'invoice_paid'`,
      [invoice.issueId],
    );
    expect(events).toHaveLength(1);

    const unknown = await deliver(piEvent('payment_intent.succeeded', 'pi_nobody_knows'));
    expect(unknown.status).toBe(200);
    expect(await appliedOf(unknown)).toBe('unknown-invoice');

    const ignored = await deliver(
      stripeEvent('customer.created', {
        object: 'customer',
        id: 'cus_1',
      }),
    );
    expect(await appliedOf(ignored)).toBe('ignored');
  });

  it('keeps paid unchanged when payment_failed arrives late (already-final), but refundable', async () => {
    const invoice = await processInvoice();
    await deliver(piEvent('payment_intent.succeeded', invoice.pi));
    const late = await deliver(piEvent('payment_intent.payment_failed', invoice.pi));
    expect(await appliedOf(late)).toBe('already-final');
    expect(await statusOf(invoice.id)).toBe('paid');

    const refund = await deliver(
      stripeEvent('charge.refunded', {
        object: 'charge',
        id: 'ch_fake',
        payment_intent: invoice.pi,
      }),
    );
    expect(await appliedOf(refund)).toBe('refunded');
    expect(await statusOf(invoice.id)).toBe('refunded');
  });
});
