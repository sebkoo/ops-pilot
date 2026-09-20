import type { Hono } from 'hono';
import { one, query } from '../../src/db.js';
import { bodyOf, createResolvedIssue, jsonHeaders, type TestUser } from './users.js';

// One invoice with a PaymentIntent attached
export interface SeededInvoice {
  id: string;
  issueId: string;
  paymentIntentId: string;
}

// Creates an invoice and attaches a PaymentIntent
// Populates `stripe_payment_intent_id` for webhooks & reconciliation worker
export async function seedInvoice(
  app: Hono,
  manager: TestUser,
  amountCents = 4200,
): Promise<SeededInvoice> {
  const issue = await createResolvedIssue(app, manager);
  const created = await app.request('/invoices', {
    method: 'POST',
    headers: jsonHeaders(manager.token, { 'idempotency-key': crypto.randomUUID() }),
    body: JSON.stringify({ issueId: issue.id, vendorName: 'ColdFix Inc.', amountCents }),
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
    paymentIntentId: row.stripe_payment_intent_id,
  };
}

// Make the invoice appear to have been stuck N minutes ago
// Move the timestamp backward since we cannot wait 10 minutes in a test.
export async function oldInvoice(id: string, minutesAgo: number): Promise<void> {
  await query(
    `UPDATE invoice
     SET updated_at = now() - make_interval(mins => $2)
     WHERE id = $1`,
    [id, minutesAgo],
  );
}
