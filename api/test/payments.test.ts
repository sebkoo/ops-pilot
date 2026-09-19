import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { initConfig } from '../src/config.js';
import { closePool, one, query } from '../src/db.js';
import { useStripeClient } from '../src/modules/payments/stripe.js';
import { FakeStripe, useTestStripeEnv } from './support/fakeStripe.js';
import {
  bodyOf,
  createResolvedIssue,
  errorCodeOf,
  idOf,
  jsonHeaders,
  registerUser,
  type TestUser,
} from './support/users.js';

type IdBody = { id: string };
type IntentBody = {
  clientSecret: string;
  publishableKey: string;
  amountCents: number;
};

const stripe = new FakeStripe();
let manager: TestUser;
let staff: TestUser;

beforeAll(async () => {
  useTestStripeEnv();
  initConfig();
  useStripeClient(stripe);
  manager = await registerUser(app, 'manager');
  staff = await registerUser(app, 'staff');
});
afterAll(async () => {
  useStripeClient(null);
  await closePool();
});

const post = (path: string, token: string, body: unknown, key = crypto.randomUUID()) =>
  app.request(path, {
    method: 'POST',
    headers: jsonHeaders(token, { 'idempotency-key': key }),
    body: JSON.stringify(body),
  });

describe('invoices (p.4)', () => {
  it('Create rules: managers, resolved issues, and positive integer amounts in cents', async () => {
    const issue = await createResolvedIssue(app, manager);
    const asStaff = await post('/invoices', staff.token, {
      issueId: issue.id,
      vendorName: 'ColdFix Inc.',
      amountCents: 12900,
    });
    expect(asStaff.status).toBe(403);

    const open = await app.request('/issues', {
      method: 'POST',
      headers: jsonHeaders(manager.token),
      body: JSON.stringify({
        title: 'Work Not Finished Yet',
        category: 'other',
        priority: 'low',
        location: 'Store 128',
      }),
    });
    const openIssue = await bodyOf<IdBody>(open);
    const early = await post('/invoices', manager.token, {
      issueId: openIssue.id,
      vendorName: 'ColdFix Inc.',
      amountCents: 12900,
    });
    expect(early.status).toBe(422);
    expect(await errorCodeOf(early)).toBe('issue_not_resolved');

    const fraction = await post('/invoices', manager.token, {
      issueId: issue.id,
      vendorName: 'Type',
      amountCents: 129.5,
    });
    expect(fraction.status).toBe(400);
    expect(await errorCodeOf(fraction)).toBe('validation_error');

    const ok = await post('/invoices', manager.token, {
      issueId: issue.id,
      vendorName: 'ColdFix Inc.',
      amountCents: 12900,
    });
    expect(ok.status).toBe(201);
    expect((await ok.json()) as object).toMatchObject({
      status: 'unpaid',
      version: 1,
      amountCents: 12900,
      currency: 'usd',
    });

    const list = await app.request(`/invoices?issueId=${issue.id}`, {
      headers: jsonHeaders(manager.token),
    });
    expect((await bodyOf<{ invoices: unknown[] }>(list)).invoices).toHaveLength(1);
  });

  it('Two-layer idempotency: replay the same key, and create only one PaymentIntent', async () => {
    const issue = await createResolvedIssue(app, manager);
    const key = crypto.randomUUID();
    const body = {
      issueId: issue.id,
      vendorName: 'ColdFix Inc.',
      amountCents: 5000,
    };
    const first = await post('/invoices', manager.token, body, key);
    const second = await post('/invoices', manager.token, body, key);
    expect(second.headers.get('idempotent-replayed')).toBe('true');

    const invoice = await bodyOf<IdBody>(first);
    expect(await idOf(second)).toBe(invoice.id);

    const counted = await one<{ count: string }>(
      `SELECT count(*)::text AS count 
       FROM Invoices 
       WHERE issue_id = $1`,
      [issue.id],
    );
    expect(Number(counted?.count)).toBe(1);

    const before = stripe.created.length;
    const firstRes = await post(`/invoices/${invoice.id}/payment-intent`, manager.token, {});
    const intent = await bodyOf<IntentBody>(firstRes);
    const replayRes = await post(`/invoices/${invoice.id}/payment-intent`, manager.token, {});
    const replay = await bodyOf<{ clientSecret: string }>(replayRes);
    expect(intent.publishableKey).toBe('pk_test_vitest');
    expect(intent.amountCents).toBe(5000);
    expect(replay.clientSecret).toBe(intent.clientSecret);
    expect(stripe.created.length - before).toBe(1);
    expect(stripe.createOptions.at(-1)?.idempotencyKey).toBe(`invoice:${invoice.id}`);
    expect(stripe.created.at(-1)?.metadata).toMatchObject({
      invoiceId: invoice.id,
      issueId: issue.id,
    });

    const stored = await one<{
      status: string;
      stripe_payment_intent_id: string | null;
    }>(
      `SELECT status, stripe_payment_intent_id
       FROM invoices
       WHERE id = $1`,
      [invoice.id],
    );
    expect(stored?.status).toBe('processing');
    expect(stored?.stripe_payment_intent_id).toMatch(/^pi_fake_/);
  });
});

it('Refunds for paid invoices: unpaid returns 409, paid returns 202 and creates one refund', async () => {
  const issue = await createResolvedIssue(app, manager);
  const created = await post('/invoices', manager.token, {
    issueId: issue.id,
    vendorName: 'ColdFix Inc.',
    amountCents: 3000,
  });
  const invoice = await bodyOf<IdBody>(created);
  const tooEarly = await post(`/invoices/${invoice.id}/refund`, manager.token, {});
  expect(tooEarly.status).toBe(409);
  expect(await errorCodeOf(tooEarly)).toBe('not_refundable');

  await post(`/invoices/${invoice.id}/payment-intent`, manager.token, {});
  await query(
    `UPDATE invoices 
     SET status = 'paid' 
     WHERE id = $1`,
    [invoice.id],
  ); // Simulate the work normally performed by the webhook
  const before = stripe.refunded.length;
  const refund = await post(`/invoices/${invoice.id}/refund`, manager.token, {});
  expect(refund.status).toBe(202);
  expect(stripe.refunded.length - before).toBe(1);
  expect(stripe.refunded.at(-1)?.payment_intent).toMatch(/^pi_fake_/);
});
