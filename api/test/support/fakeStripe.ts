import Stripe from 'stripe';
import type { StripeClient } from '../../src/modules/payments/stripe.js';

export const TEST_WEBHOOK_SECRET = 'whsec_test_secret_for_vitest';

// OFfline Stripe: fake payment intents and refunds,
// while delegating webhook signature verification to the real SDK (offline HMAC verification).
export class FakeStripe implements StripeClient {
  readonly created: Stripe.PaymentIntentCaptureParams[] = [];
  readonly createOptions: (Stripe.RequestOptions | undefined)[] = [];
  readonly refunded: Stripe.RefundCreateParams[] = [];
  readonly statuses = new Map<string, Stripe.PaymentIntent.Status>();
  private readonly real = new Stripe('sk_test_offline_only');

  paymentIntents = {
    create: async (
      params: Stripe.PaymentIntentCreateParams,
      options?: Stripe.RequestOptions,
    ): Promise<Stripe.PaymentIntent> => {
      this.created.push(params);
      this.createOptions.push(options);
      const id = `pi_fake_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
      this.statuses.set(id, 'requires_payment_method');
      return this.intent(id);
    },
    retrieve: async (id: string): Promise<Stripe.PaymentIntent> => this.intent(id),
  };

  refunds = {
    create: async (
      params: Stripe.RefundCreateParams,
      _options?: Stripe.RequestOptions,
    ): Promise<Stripe.Refund> => {
      this.refunded.push(params);
      return {
        id: `re_fake_${this.refunded.length}`,
        object: 'refund',
        status: 'succeeded',
      } as unknown as Stripe.Refund;
    },
  };

  webhooks = {
    constructEvent: (payload: string, header: string, secret: string): Stripe.Event =>
      this.real.webhooks.constructEvent(payload, header, secret),
  };

  // Used by tests to create a webhook request that appears to be signed by Stripe.
  sign(payload: string, secret = TEST_WEBHOOK_SECRET): string {
    return this.real.webhooks.generateTestHeaderString({ payload, secret });
  }

  private intent(id: string): Stripe.PaymentIntent {
    return {
      id,
      object: 'payment_intent',
      status: this.statuses.get(id) ?? 'requires_payment_method',
      client_secret: `${id}_secret_test`,
      amount: 0,
      currency: 'usd',
    } as unknown as Stripe.PaymentIntent;
  }
}

export const stripeEvent = (id: string, type: string, object: Record<string, unknown>): string =>
  JSON.stringify({
    id,
    object: 'event',
    type,
    created: Math.floor(Date.now() / 1000),
    data: { object },
  });
