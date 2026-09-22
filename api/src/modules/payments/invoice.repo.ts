import { z } from 'zod';
import { one, query, type Txn, withTransaction } from '../../db.js';
import type { CreateInvoiceInput, InvoiceLineInput, LineKind } from './invoice.schema.js';
import { canTransition, InvoiceStatus } from './invoice.schema.js';

export const InvoiceRow = z.object({
  id: z.string(),
  issue_id: z.string(),
  vendor_name: z.string(),
  amount_cents: z.number(),
  currency: z.string(),
  status: InvoiceStatus,
  stripe_payment_intent_id: z.string().nullable(),
  created_by: z.string(),
  created_at: z.date(),
  updated_at: z.date(),
  version: z.number(),
});
export type InvoiceRow = z.infer<typeof InvoiceRow>;
export interface Invoice {
  id: string;
  issueId: string;
  vendorName: string;
  amountCents: number;
  currency: string;
  status: InvoiceStatus;
  paymentIntentId: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

const COLUMNS = Object.keys(InvoiceRow.shape).join(', ');
const toInvoice = (r: InvoiceRow): Invoice => ({
  id: r.id,
  issueId: r.issue_id,
  vendorName: r.vendor_name,
  amountCents: r.amount_cents,
  currency: r.currency,
  status: r.status,
  paymentIntentId: r.stripe_payment_intent_id,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  version: r.version,
});

type NewInvoice = CreateInvoiceInput & { createdBy: string };

async function insertInTransaction(db: Txn, input: NewInvoice): Promise<Invoice> {
  const row = await db.one<InvoiceRow>(
    `INSERT INTO invoices (
      issue_id, 
      vendor_name, 
      amount_cents, 
      created_by) 
     VALUES ($1, $2, $3, $4) 
     RETURNING ${COLUMNS}`,
    [input.issueId, input.vendorName, input.amountCents, input.createdBy],
  );
  if (!row) throw new Error('INSERT invoices did not return a row.');
  const lines: InvoiceLineInput[] = input.lines ?? [
    { kind: 'other', description: 'Total', amountCents: input.amountCents },
  ];
  for (const [position, line] of lines.entries()) {
    await db.query(
      `INSERT INTO invoice_lines (
        invoice_id, 
        position, 
        kind, 
        description, 
        amount_cents) 
       VALUES ($1, $2, $3, $4, $5)`,
      [row.id, position, line.kind, line.description, line.amountCents],
    );
  }
  return toInvoice(row);
}

export async function insertInvoice(input: NewInvoice): Promise<Invoice> {
  return withTransaction((db) => insertInTransaction(db, input));
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const row = await one<InvoiceRow>(
    `SELECT ${COLUMNS} 
     FROM invoices 
     WHERE id = $1`,
    [id],
  );
  return row ? toInvoice(row) : null;
}

export async function listInvoices(issueId: string): Promise<Invoice[]> {
  const rows = await query<InvoiceRow>(
    `SELECT ${COLUMNS} 
     FROM invoices 
     WHERE issue_id = $1 
     ORDER BY created_at DESC`,
    [issueId],
  );
  return rows.map(toInvoice);
}

export async function findInvoiceByPaymentIntent(paymentIntentId: string): Promise<Invoice | null> {
  const row = await one<InvoiceRow>(
    `SELECT ${COLUMNS} 
     FROM invoices 
     WHERE stripe_payment_intent_id = $1`,
    [paymentIntentId],
  );
  return row ? toInvoice(row) : null;
}

export async function attachPaymentIntent(id: string, paymentIntentId: string): Promise<void> {
  await query(
    `UPDATE invoices 
     SET stripe_payment_intent_id = $2, updated_at = now() 
     WHERE id = $1 AND 
      stripe_payment_intent_id IS NULL`,
    [id, paymentIntentId],
  );
}

export async function transitionInvoice(
  id: string,
  from: InvoiceStatus,
  to: InvoiceStatus,
): Promise<Invoice | null> {
  if (!canTransition(from, to)) return null;
  const row = await one<InvoiceRow>(
    `UPDATE invoices 
     SET status = $3, 
      updated_at = now(), 
      version = version + 1 
     WHERE id = $1 AND 
      status = $2 
     RETURNING ${COLUMNS}`,
    [id, from, to],
  );
  return row ? toInvoice(row) : null;
}

export async function claimEvent(id: string, type: string): Promise<boolean> {
  const row = await one<{ id: string }>(
    `INSERT INTO stripe_events (id, type) 
     VALUES ($1, $2) 
     ON CONFLICT (id) DO NOTHING 
     RETURNING id`,
    [id, type],
  );
  return row !== null;
}

// One invoice line for the allocation weight
export interface InvoiceLine {
  id: string;
  position: number;
  kind: LineKind;
  description: string;
  amountCents: number;
}

interface LineRow {
  id: string;
  position: number;
  kind: string;
  description: string;
  amount_cents: number;
}

// Invoice lines in position order
export async function listLines(invoiceId: string): Promise<InvoiceLine[]> {
  const rows = await query<LineRow>(
    `SELECT id, position, kind, description, amount_cents
     FROM invoice_lines
     WHERE invoice_id = $1
     ORDER BY position`,
    [invoiceId],
  );
  return rows.map((row) => ({
    id: row.id,
    position: row.position,
    kind: row.kind as InvoiceLine['kind'],
    description: row.description,
    amountCents: row.amount_cents,
  }));
}

// Total refunded so far
// returns 0 when there have been no refunds
export async function refundedTotal(invoiceId: string): Promise<number> {
  const row = await one<{ total: string }>(
    `SELECT COALESCE(sum(amount_cents), 0)::text AS total
     FROM invoice_refunds
     WHERE invoice_id = $1`,
    [invoiceId],
  );
  return Number(row?.total ?? 0);
}

// Record one refund in the ledger to persis the entire allocation breakdown
export async function recordRefund(
  invoiceId: string,
  amountCents: number,
  reason: string,
  stripeRefundId: string,
  allocation: Record<string, number>,
): Promise<void> {
  await query(
    `INSERT INTO invoice_refunds (
      invoice_id, 
      amount_cents, 
      reason, 
      stripe_refund_id, 
      allocation)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (stripe_refund_id) DO NOTHING`,
    [invoiceId, amountCents, reason, stripeRefundId, JSON.stringify(allocation)],
  );
}
