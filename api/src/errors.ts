import type { ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly details: unknown;

  constructor(
    status: ContentfulStatusCode,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const onError: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
          details: err.details ?? null,
        },
      },
      err.status,
    );
  }

  if (err instanceof HTTPException) {
    return c.json(
      {
        error: {
          code: 'http_exception',
          message: err.message || 'Unable to process the request.',
        },
      },
      err.status,
    );
  }
  console.error(err);
  return c.json(
    {
      error: {
        code: 'internal_server_error',
        message: 'Something went wrong on the server. Please try again later.',
      },
    },
    500,
  );
};

export const onNotFound: NotFoundHandler = (c) => {
  return c.json(
    {
      error: {
        code: 'not_found',
        message: `${c.req.method} ${c.req.path} route does not exist.`,
      },
    },
    404,
  );
};
