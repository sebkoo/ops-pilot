import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { initConfig } from '../src/config.js';
import { closePool, one, query } from '../src/db.js';
import type { ErrorBody } from '../src/errors.js';
import { listLines } from '../src/modules/payments/invoice.repo.js';
import type { InvoiceLineInput } from '../src/modules/payments/invoice.schema.js';
import { useStripeClient } from '../src/modules/payments/stripe.js';
import type { ValidationIssue } from '../src/validate.js';
import { FakeStripe, useTestStripeEnv } from './support/fakeStripe.js';
import { seedInvoice } from './support/invoices.js';
import {
  bodyOf,
  createResolvedIssue,
  jsonHeaders,
  registerUser,
  type TestUser,
} from './support/users.js';

const stripe = new FakeStripe();
let manager: TestUser;

const LINES: InvoiceLineInput[] = [
  { kind: 'parts', description: 'Compressor', amountCents: 12000 },
  { kind: 'labor', description: 'Tow hours', amountCents: 8500 },
  { kind: 'trip', description: 'Truck roll', amountCents: 4505 },
];
const TOTAL = 25005;

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

const post = (path: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: jsonHeaders(manager.token, {
      'idempotency-key': crypto.randomUUID(),
    }),
    body: JSON.stringify(body),
  });

// One refund request
// Keeps the route and request body shape in one place
const refund = (invoiceId: string, amountCents: number, reason: string) =>
  post(`/invoices/${invoiceId}/refund`, { amountCents, reason });

// Mark a three-line invoice as paid
const paidInvoice = async () => {
  const invoice = await seedInvoice(app, manager, TOTAL, LINES);
  await query(
    `UPDATE invoices
     SET status = 'paid'
     WHERE id = $1`,
    [invoice.id],
  );
  return invoice;
};

describe('partial refunds (p.7)', () => {
  it('Creates a single total line when no lines are provided', async () => {
    const invoice = await seedInvoice(app, manager, 4200);
    const lines = await listLines(invoice.id);
    expect(lines.map((line) => line.amountCents)).toEqual([4200]);
    expect(lines[0]?.kind).toBe('other');
  });

  it('Returns 400 when line totals do not match the invoice total and identifies the invalid field', async () => {
    const issue = await createResolvedIssue(app, manager);
    const res = await post('/invoices', {
      issueId: issue.id,
      vendorName: 'ColdFix Inc.',
      amountCents: 25000,
      lines: LINES,
    });
    expect(res.status).toBe(400);

    const body = await bodyOf<ErrorBody<ValidationIssue[]>>(res);
    expect(body.error.code).toBe('validation_error');
    expect(body.error.details[0]?.path).toBe('lines');
  });

  it('Two refunds creates two refunds; exceeding the remaining balance returns 422 & the remaining amount', async () => {
    const invoice = await paidInvoice();
    expect((await refund(invoice.id, 2500, 'Wrong part')).status).toBe(202);
    expect((await refund(invoice.id, 20000, 'Job redone')).status).toBe(202);

    const tooMuch = await refund(invoice.id, 3000, 'One more');
    expect(tooMuch.status).toBe(422);

    const refusal = await bodyOf<ErrorBody<{ remainingCents: number }>>(tooMuch);
    expect(refusal.error.code).toBe('exceeds_remaining');
    expect(refusal.error.details.remainingCents).toBe(2505);
    expect(stripe.refunded.slice(-2).map((refund) => refund.amount)).toEqual([2500, 20000]);
  });

  it('Stores the allocation: line IDs as keys, with the full breakdown table', async () => {
    const invoice = await paidInvoice();
    await refund(invoice.id, 2500, 'Ten percent off');
    const row = await one<{ allocation: Record<string, number> }>(
      `SELECT allocation
       FROM invoice_refunds
       WHERE invoice_id = $1`,
      [invoice.id],
    );
    const lines = await listLines(invoice.id);
    expect(lines.map((line) => row?.allocation[line.id])).toEqual([1200, 850, 450]);
  });
});
