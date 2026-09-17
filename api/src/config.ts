import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  STRIPE_SECRET_KEY: z
    .string()
    .regex(/^(sk|rk)_test_/, 'Only Stripe test keys are allowed.')
    .optional(),
  STRIPE_PUBLISHABLE_KEY: z
    .string()
    .regex(/^pk_test_/, 'Only Stripe test keys are allowed.')
    .optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_').optional(),
});

export type Config = z.infer<typeof EnvSchema>;
export const config: Config = {} as Config;

export function initConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    throw new Error(`Invalid environment variables: ${problems}`);
  }

  for (const key of Object.keys(config)) delete (config as Record<string, unknown>)[key];

  Object.assign(config, parsed.data);
  return config;
}
