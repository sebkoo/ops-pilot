import { z } from 'zod';

export const InvoiceStatus = z.enum(['unpaid', 'processing', 'paid', 'failed', 'refunded']);
export type InvoiceStatus = z.infer<typeof InvoiceStatus>;

export const CreateInvoiceSchema = z.object({
  issueId: z.uuid(),
  vendorName: z.string().trim().min(1).max(80),
  amountCents: z.number().int().positive().max(5_000_000),
});
export type CreateInvoiceInput = z.infer<typeof CreateInvoiceSchema>;

export const InvoiceIdParam = z.object({ id: z.uuid() });
export const IssueIdQuery = z.object({ issueId: z.uuid() });

const ALLOWED: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  unpaid: ['processing'],
  processing: ['paid', 'failed'],
  failed: ['processing', 'paid'],
  paid: ['refunded'],
  refunded: [],
};
export const canTransition = (from: InvoiceStatus, to: InvoiceStatus): boolean =>
  ALLOWED[from].includes(to);
