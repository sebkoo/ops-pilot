import { z } from 'zod';

export const InvoiceStatus = z.enum(['unpaid', 'processing', 'paid', 'failed', 'refunded']);
export type InvoiceStatus = z.infer<typeof InvoiceStatus>;

// One invoice line: type, description, and amount
export const LineKind = z.enum(['parts', 'labor', 'trip', 'other']);
export type LineKind = z.infer<typeof LineKind>;

export const InvoiceLineSchema = z.object({
  kind: LineKind,
  description: z.string().trim().min(1).max(120),
  amountCents: z.number().int().positive(),
});
export type InvoiceLineInput = z.infer<typeof InvoiceLineSchema>;

// The sum of the line amounts: integer cents
const sumCents = (lines: InvoiceLineInput[]): number =>
  lines.reduce((sum, line) => sum + line.amountCents, 0);

export const CreateInvoiceSchema = z
  .object({
    issueId: z.uuid(),
    vendorName: z.string().trim().min(1).max(80),
    amountCents: z.number().int().positive().max(5_000_000),
    lines: z.array(InvoiceLineSchema).min(1).max(50).optional(),
  })
  .refine((invoice) => !invoice.lines || sumCents(invoice.lines) === invoice.amountCents, {
    message: 'lines must add up to amountCents',
    path: ['lines'],
  });

export type CreateInvoiceInput = z.infer<typeof CreateInvoiceSchema>;

export const InvoiceIdParamSchema = z.object({ id: z.uuid() });
export const IssueIdQuerySchema = z.object({ issueId: z.uuid() });

const ALLOWED: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  unpaid: ['processing'],
  processing: ['paid', 'failed'],
  failed: ['processing', 'paid'],
  paid: ['refunded'],
  refunded: [],
};
export const canTransition = (from: InvoiceStatus, to: InvoiceStatus): boolean =>
  ALLOWED[from].includes(to);

// The core of a partial refund: how much and why
export const RefundSchema = z.object({
  amountCents: z.number().int().positive(),
  reason: z.string().trim().min(1).max(200),
});
export type RefundInput = z.infer<typeof RefundSchema>;
