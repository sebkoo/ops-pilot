import Stripe from 'stripe';
import { config } from '../../config.js';
import { AppError } from '../../errors.js';

// Only the Stripe functionality we use:
// keep the interface narrow so tests can inject a fake
export interface StripeClient {
  paymentIntents: {
    create(
      params: Stripe.PaymentIntentCreateParams,
      options?: Stripe.RequestOptions,
    ): Promise<Stripe.PaymentIntent>;
    retrieve(id: string): Promise<Stripe.PaymentIntent>;
  };
  refunds: {
    create(
      params: Stripe.RefundCreateParams,
      options?: Stripe.RequestOptions,
    ): Promise<Stripe.Refund>;
  };
  webhooks: {
    constructEvent(payload: string, header: string, secret: string): Stripe.Event;
  };
}

let client: StripeClient | null = null;

export function stripe(): StripeClient {
  if (client) return client;
  if (!config.STRIPE_SECRET_KEY)
    throw new AppError(503, 'payments_not_configured', 'Payments are not configured.');
  client = new Stripe(config.STRIPE_SECRET_KEY);
  return client;
}

// Test-only: inject a fake Stripe client `null` or restore the real implementation.
export function useStripeClient(fake: StripeClient | null): void {
  client = fake;
}

export function publishableKey(): string {
  if (!config.STRIPE_PUBLISHABLE_KEY)
    throw new AppError(503, 'payments_not_configured', 'Payments are not configured.');
  return config.STRIPE_PUBLISHABLE_KEY;
}

export function webhookSecret(): string {
  if (!config.STRIPE_WEBHOOK_SECRET)
    throw new AppError(503, 'payments_not_configured', 'The webhook secret is not configured.');
  return config.STRIPE_WEBHOOK_SECRET;
}
