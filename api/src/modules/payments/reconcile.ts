import { getPool, type Queryable } from '../../db.js';
import { recordEvent } from '../issues/event.repo.js';
import { transitionInvoice } from './invoice.repo.js';
import type { StripeClient } from './stripe.js';

export interface ReconcileOptions {
  batch?: number;
  olderThanMinutes?: number;
}
export interface AppliedTransition {
  id: string;
  next: 'paid' | 'failed';
}
export interface ReconcileSummary {
  claimed: number;
  applied: AppliedTransition[];
}
export interface ClaimedRow {
  id: string;
  issue_id: string;
  stripe_payment_intent_id: string;
}
export interface StaleInvoice {
  id: string;
  issueId: string;
  paymentIntentId: string;
}

// Claims invoices that have remained in `processing` for too long.
// `updated_at` marks the row so another worker will not claim the same row again.
// `FOR UPDATE SKIP LOCKED` skips rows currently locked by another worker instead of waiting for them.
export async function claimStale(
  db: Queryable,
  { batch = 20, olderThanMinutes = 10 }: ReconcileOptions = {},
): Promise<StaleInvoice[]> {
  const { rows: claimed } = await db.query<ClaimedRow>(
    `WITH stale AS (
      SELECT id
      FROM invoices
      WHERE status = 'processing' AND
        stripe_payment_intent_id IS NOT NULL AND
        updated_at < now() - make_interval(mins => $2)
      ORDER BY updated_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE invoices 
    SET updated_at = now()
    WHERE id IN (SELECT id FROM stale)
    RETURNING id, issue_id, stripe_payment_intent_id`,
    [batch, olderThanMinutes],
  );
  return claimed.map((row) => ({
    id: row.id,
    issueId: row.issue_id,
    paymentIntentId: row.stripe_payment_intent_id,
  }));
}

const FINAL: Partial<Record<string, 'paid' | 'failed'>> = {
  succeeded: 'paid',
  canceled: 'failed',
};

// Ask Stripe for the authoritative status: returns `null` if the request fails.
// Isolate the decision to swallow the error in this single function
async function askStripe(client: StripeClient, job: StaleInvoice): Promise<string | null> {
  try {
    const intent = await client.paymentIntents.retrieve(job.paymentIntentId);
    return intent.status;
  } catch (error) {
    console.error('reconcile: stripe failed', job.id, String(error));
    return null;
  }
}

// Once reconciliation pass:
// ask Stripe for the authoritative status of each claimed invoice.
// If the PaymentIntent is still in progress, leave the invoice unchanged
// so a later reconciliation pass can check it again
export async function reconcileOnce(
  client: StripeClient,
  options: ReconcileOptions = {},
): Promise<ReconcileSummary> {
  const jobs = await claimStale(getPool(), options);
  const applied: AppliedTransition[] = [];
  for (const job of jobs) {
    const stripeStatus = await askStripe(client, job);
    if (!stripeStatus) continue;

    const next = FINAL[stripeStatus];
    if (!next) continue;

    const moved = await transitionInvoice(job.id, 'processing', next);
    if (!moved) continue;

    if (next === 'paid')
      await recordEvent(job.issueId, null, 'invoice_paid', {
        invoiceId: job.id,
        source: 'reconcile',
      });
    applied.push({ id: job.id, next });
  }
  return { claimed: jobs.length, applied };
}
