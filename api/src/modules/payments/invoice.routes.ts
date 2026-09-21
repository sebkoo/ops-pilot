import { Hono } from 'hono';
import type { ErrorBody } from '../../errors.js';
import { AppError } from '../../errors.js';
import { type AuthEnv, requireAuth, requireRole } from '../../middleware/auth.js';
import { idempotency } from '../../middleware/idempotency.js';
import { validate } from '../../validate.js';
import { recordEvent } from '../issues/event.repo.js';
import { getIssue } from '../issues/issue.repo.js';
import { spread } from './allocation.js';
import {
  attachPaymentIntent,
  getInvoice,
  insertInvoice,
  listInvoices,
  listLines,
  recordRefund,
  refundedTotal,
  transitionInvoice,
} from './invoice.repo.js';
import {
  CreateInvoiceSchema,
  InvoiceIdParamSchema,
  IssueIdQuerySchema,
  RefundSchema,
} from './invoice.schema.js';
import { publishableKey, stripe } from './stripe.js';

// When to refuse a refund
// The shopper-facing sentence lives with the reason,
// so the app never has to invent wording for a case the server knows about.
type RefundRefusal =
  | { code: 'not_paid' }
  | { code: 'already_refunded' }
  | { code: 'exceeds_remaining'; remainingCents: number }
  | { code: 'no_lines' };

const REFUSAL_MESSAGE: Record<RefundRefusal['code'], string> = {
  not_paid: 'This invoice has not been paid yet.',
  already_refunded: 'This invoice has already been fully refunded.',
  exceeds_remaining: 'The amount is larger than what is left to refund.',
  no_lines: 'This invoice has no lines to allocate a refund across.',
};

// Convert one refund refusal into the standard response shape
const fail = (code: RefundRefusal['code'], details: unknown = null): ErrorBody => ({
  error: {
    code,
    message: REFUSAL_MESSAGE[code],
    details,
  },
});

export const invoiceRoutes = new Hono<AuthEnv>();
invoiceRoutes.use('*', requireAuth);
invoiceRoutes.use('*', idempotency);

invoiceRoutes.get('/', validate('query', IssueIdQuerySchema), async (c) => {
  return c.json({ invoices: await listInvoices(c.req.valid('query').issueId) });
});

invoiceRoutes.get('/:id', validate('param', InvoiceIdParamSchema), async (c) => {
  const invoice = await getInvoice(c.req.valid('param').id);
  if (!invoice) throw new AppError(404, 'not_found', 'Invoice could not be found.');
  return c.json(invoice);
});

invoiceRoutes.post(
  '/',
  requireRole('manager'),
  validate('json', CreateInvoiceSchema),
  async (c) => {
    const input = c.req.valid('json');
    const issue = await getIssue(input.issueId);
    if (!issue) throw new AppError(404, 'not_found', 'Issue could not be found.');
    if (issue.status !== 'resolved')
      throw new AppError(422, 'issue_not_resolved', 'Only resolved issues can create invoices.', {
        status: issue.status,
      });
    const invoice = await insertInvoice({ ...input, createdBy: c.get('user').id });
    await recordEvent(issue.id, c.get('user').id, 'invoice_created', {
      invoiceId: invoice.id,
      vendorName: invoice.vendorName,
      amountCents: invoice.amountCents,
    });
    return c.json(invoice, 201);
  },
);

invoiceRoutes.post(
  '/:id/payment-intent',
  requireRole('manager'),
  validate('param', InvoiceIdParamSchema),
  async (c) => {
    const invoice = await getInvoice(c.req.valid('param').id);
    if (!invoice) throw new AppError(404, 'not_found', 'Invoice could not found.');
    if (invoice.status === 'paid' || invoice.status === 'refunded')
      throw new AppError(409, 'already_paid', 'This invoice has already been paid.', {
        status: invoice.status,
      });
    const intent = invoice.paymentIntentId
      ? await stripe().paymentIntents.retrieve(invoice.paymentIntentId)
      : await stripe().paymentIntents.create(
          {
            amount: invoice.amountCents,
            currency: invoice.currency,
            automatic_payment_methods: {
              enabled: true,
              allow_redirects: 'never',
            },
            metadata: {
              invoiceId: invoice.id,
              issueId: invoice.issueId,
            },
          },
          { idempotencyKey: `invoice:${invoice.id}` },
        );
    if (!invoice.paymentIntentId) await attachPaymentIntent(invoice.id, intent.id);
    if (invoice.status !== 'processing')
      await transitionInvoice(invoice.id, invoice.status, 'processing');
    if (!intent.client_secret)
      throw new AppError(502, 'stripe_error', 'Stripe did not return a client secret.');
    return c.json({
      invoiceId: invoice.id,
      clientSecret: intent.client_secret,
      publishableKey: publishableKey(),
      amountCents: invoice.amountCents,
      currency: invoice.currency,
    });
  },
);

invoiceRoutes.post(
  '/:id/refund',
  requireRole('manager'),
  validate('param', InvoiceIdParamSchema),
  validate('json', RefundSchema),
  async (c) => {
    const body = c.req.valid('json');

    const invoice = await getInvoice(c.req.valid('param').id);
    if (!invoice) throw new AppError(404, 'not_found', 'Invoice could not be found.');
    if (invoice.status !== 'paid' || !invoice.paymentIntentId)
      throw new AppError(409, 'not_refundable', 'Only paid invoices can be refunded.', {
        status: invoice.status,
      });

    const lines = await listLines(invoice.id);
    if (lines.length === 0) return c.json(fail('no_lines'), 422);

    const alreadyRefunded = await refundedTotal(invoice.id);
    const remaining = invoice.amountCents - alreadyRefunded;
    if (remaining <= 0) return c.json(fail('already_refunded'), 422);
    if (body.amountCents > remaining) {
      return c.json(fail('exceeds_remaining', { remainingCents: remaining }), 422);
    }
    const allocation = spread(
      body.amountCents,
      lines.map((line) => ({
        id: line.id,
        weight: line.amountCents,
      })),
    );

    const refund = await stripe().refunds.create(
      { payment_intent: invoice.paymentIntentId, amount: body.amountCents },
      { idempotencyKey: `refund:${invoice.id}:${alreadyRefunded}` },
    );

    await recordRefund(invoice.id, body.amountCents, body.reason, refund.id, allocation);
  },
);
