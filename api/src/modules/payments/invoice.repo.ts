import { z } from 'zod';
import { one, query } from '../../db.js';
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

export async function insertInvoice(input: {
  issueId: string;
  vendorName: string;
  amountCents: number;
  createdBy: string;
}): Promise<Invoice> {
  const row = await one<InvoiceRow>(
    `INSERT INTO invoices (issue_id, vendor_name, amount_cents, created_by) 
     VALUES ($1, $2, $3, $4) 
     RETURNING ${COLUMNS}`,
    [input.issueId, input.vendorName, input.amountCents, input.createdBy],
  );
  if (!row) throw new Error('INSERT INTO invoices did not return a row.');
  return toInvoice(row);
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
