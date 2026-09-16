import { describe, expect, it } from 'vitest';
import { initConfig } from '../src/config.js';

const base = { DATABASE_URL: 'postgres://x', JWT_SECRET: 'a'.repeat(32) };

describe('config - production keys are rejected by the code (P.2)', () => {
  it('allows only test keys, refuses to start with a live key, and starts', () => {
    expect(() =>
      initConfig({
        ...base,
        STRIPE_SECRET_KEY: 'sk_test_abc',
        STRIPE_PUBLISHABLE_KEY: 'pk_test_abc',
        STRIPE_WEBHOOK_SECRET: 'whsec_abc',
      }),
    ).not.toThrow();
    expect(() =>
      initConfig({ ...base, STRIPE_SECRET_KEY: 'sk_live_abc' }),
    ).toThrow(/Only Stripe test keys are allowed/);
    expect(() =>
      initConfig({ ...base, STRIPE_PUBLISHABLE_KEY: 'pk_live_abc' }),
    ).toThrow(/Only Stripe test keys are allowed/);
    expect(() =>
      initConfig({ ...base, STRIPE_WEBHOOK_SECRET: 'not_a_secret' }),
    ).toThrow();
    expect(initConfig(base).STRIPE_SECRET_KEY).toBeUndefined();
  });
});
