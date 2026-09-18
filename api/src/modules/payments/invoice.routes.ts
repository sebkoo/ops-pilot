import { Hono } from 'hono';
import { AppError } from '../../errors.js';
import { type AuthEnv, requireAuth, requireRole } from '../../middleware/auth.js';
import { idempotency } from '../../middleware/idempotency.js';
import { validate } from '../../validate.js';
import { recordEvent } from '../issues/event.repo.js';
import { getIssue } from '../issues/issue.repo.js';
import {
  attachPaymentIntent,
  getInvoice,
  insertInvoice,
  listInvoices,
  transitionInvoice,
} from './invoice.repo.js';
import { CreateInvoiceSchema, InvoiceIdParam, IssueIdQuery } from './invoice.schema.js';
import { publishableKey, stripe } from './stripe.js';

export const invoiceRoutes = new Hono<AuthEnv>();
invoiceRoutes.use('*', requireAuth);
invoiceRoutes.use('*', idempotency);

invoiceRoutes.get('/', validate('query', IssueIdQuery), async (c) => {
  return c.json({ invoices: await listInvoices(c.req.valid('query').issueId) });
});

invoiceRoutes.get('/:id', validate('param', InvoiceIdParam), async (c) => {
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
  validate('param', InvoiceIdParam),
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
  validate('param', InvoiceIdParam),
  async (c) => {
    const invoice = await getInvoice(c.req.valid('param').id);
    if (!invoice) throw new AppError(404, 'not_found', 'Invoice could not be found.');
    if (invoice.status !== 'paid' || !invoice.paymentIntentId)
      throw new AppError(409, 'not_refundable', 'Only paid invoices can be refunded.', {
        status: invoice.status,
      });
    await stripe().refunds.create(
      { payment_intent: invoice.paymentIntentId },
      { idempotencyKey: `refund:${invoice.id}` },
    );
    return c.json({ accepted: true }, 202);
  },
);
