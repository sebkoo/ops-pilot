import type { ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details: unknown;
  };
}

const body = (code: string, message: string, details: unknown = null): ErrorBody => ({
  error: { code, message, details },
});
export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly details: unknown;

  constructor(status: ContentfulStatusCode, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const onError: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    return c.json(body(err.code, err.message, err.details), err.status);
  }

  if (err instanceof HTTPException) {
    return c.json(
      body('http_exception', err.message || 'Unable to process the request'),
      err.status,
    );
  }
  console.error(err);

  return c.json(
    body('internal_server_error', 'Something went wrong. Please try again later.'),
    500,
  );
};

export const onNotFound: NotFoundHandler = (c) => {
  return c.json(body('not_found', `${c.req.method} ${c.req.path} route does not exist.`), 404);
};
