import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { ZodType } from 'zod';
import { AppError } from './errors.js';

// One validation error detail: which field and why
export interface ValidationIssue {
  path: string;
  message: string;
}

export const validate = <Schema extends ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: Schema,
) =>
  zValidator(target, schema, (result) => {
    if (!result.success) {
      throw new AppError(
        400,
        'validation_error',
        'Please check your input.',
        result.error.issues.map(
          (issue): ValidationIssue => ({
            path: issue.path.join('.'),
            message: issue.message,
          }),
        ),
      );
    }
  });
