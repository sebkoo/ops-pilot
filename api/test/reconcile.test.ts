import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { initConfig } from '../src/config.js';
import { closePool, getPool, withTransaction } from '../src/db.js';
import { claimStale, reconcileOnce } from '../src/modules/payments/reconcile.js';
import { useStripeClient } from '../src/modules/payments/stripe.js';
import { FakeStripe, useTestStripeEnv } from './support/fakeStripe.js';
import { oldInvoice, type SeededInvoice, seedInvoice, statusOf } from './support/invoices.js';
import { registerUser, type TestUser } from './support/users.js';

const stripe = new FakeStripe();
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

// Same value as the default threshold in `claimStale`
// the basis for all time-based values here
const STALE_AFTER_MINUTES = 10;

// A `processing` invoice stuck for 11 minutes - simulate a missed webhook.
// Simulate a missed webhook.
const staleInvoice = async (minutesAgo = STALE_AFTER_MINUTES + 1): Promise<SeededInvoice> => {
  const invoice = await seedInvoice(app, manager);
  await oldInvoice(invoice.id, minutesAgo);
  return invoice;
};

describe('reconcile worker (P.6)', () => {
  it('succeeded → paid, canceled → failed, processing stays unchanged, skips recent invoices', async () => {
    const paid = await staleInvoice();
    const failed = await staleInvoice();
    const pending = await staleInvoice();
    const young = await staleInvoice(STALE_AFTER_MINUTES - 5);
    stripe.statuses.set(paid.paymentIntentId, 'succeeded');
    stripe.statuses.set(failed.paymentIntentId, 'canceled');
    stripe.statuses.set(pending.paymentIntentId, 'processing');
    stripe.statuses.set(young.paymentIntentId, 'succeeded');

    const summary = await reconcileOnce(stripe, { batch: 50 });
    expect(summary.applied).toEqual(
      expect.arrayContaining([
        { id: paid.id, next: 'paid' },
        { id: failed.id, next: 'failed' },
      ]),
    );
    expect(summary.applied.map((a) => a.id)).not.toContain(young.id);
    expect(await statusOf(paid.id)).toBe('paid');
    expect(await statusOf(failed.id)).toBe('failed');
    expect(await statusOf(pending.id)).toBe('processing');
    expect(await statusOf(young.id)).toBe('processing');
  });

  it('SKIP LOCKED prevents two workers from claiming the same invoice twice', async () => {
    const candidates = await Promise.all([staleInvoice(), staleInvoice(), staleInvoice()]);
    const ids = new Set(candidates.map((row) => row.id));
    const pool = getPool();
    const first = await pool.connect();
    await first.query('BEGIN');
    const mine = (
      await claimStale(first, { batch: 2, olderThanMinutes: STALE_AFTER_MINUTES })
    ).filter((row) => ids.has(row.id));
    const theirs = await withTransaction((db) =>
      claimStale(db, { batch: 50, olderThanMinutes: STALE_AFTER_MINUTES }),
    );
    await first.query('COMMIT');
    first.release();
    const mineIds = new Set(mine.map((row) => row.id));

    const overlap = theirs.filter((row) => mineIds.has(row.id));
    expect(overlap).toHaveLength(0);

    const seen = new Set([...mine, ...theirs].map((row) => row.id));
    for (const id of ids) expect(seen.has(id)).toBe(true);
    const after = await reconcileOnce(stripe, { batch: 50 });
    expect(after.claimed).toBe(0);
  });
});
