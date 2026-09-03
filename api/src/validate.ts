import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import { ZodType } from 'zod';

export const validate = <
  Schema extends ZodType,
  Target extends keyof ValidationTargets,
>(
  target: Target,
  schema: Schema,
) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      return c.json(
        {
          error: {
            code: 'validation_error',
            message: 'Please check your input.',
            details,
          },
        },
        400,
      );
    }
  });
