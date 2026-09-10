import { createHash } from 'node:crypto';
import { createMiddleware } from 'hono/factory';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { query } from '../db.js';
import { AppError } from '../errors.js';
import type { AuthEnv } from './auth.js';

interface Claim {
  status: 'processing' | 'completed';
  request_hash: string;
  response_status: number | null;
  response_body: Record<string, unknown> | null;
}

export const idempotency = createMiddleware<AuthEnv>(async (c, next) => {
  const key = c.req.header('idempotency-key');
  if (!key || !['POST', 'PATCH', 'PUT'].includes(c.req.method)) {
    await next();
    return;
  }
  const userId = c.get('user').id;
  const bodyText = await c.req.raw.clone().text();
  const requestHash = createHash('sha256')
    .update(`${c.req.method} ${c.req.path}\n${bodyText}`)
    .digest('hex');
  const claimed = await query<{ key: string }>(
    `INSERT INTO idempotency_keys (user_id, key, request_hash) 
     VALUES ($1, $2, $3) 
     ON CONFLICT (user_id, key) DO NOTHING 
     RETURNING key`,
    [userId, key, requestHash],
  );
  if (claimed.length === 0) {
    const existing = (
      await query<Claim>(
        `SELECT status, request_hash, response_status, response_body
         FROM idempotency_keys WHERE user_id = $1 AND key = $2`,
        [userId, key],
      )
    )[0];

    if (!existing)
      throw new AppError(
        500,
        'idempotency_state',
        'Unable to read the idempotency state.',
      );

    if (existing.request_hash !== requestHash)
      throw new AppError(
        422,
        'idempotency_key_reused',
        'The same Idempotency-Key was reused for a different request.',
      );

    if (existing.status === 'processing' || existing.response_status === null)
      throw new AppError(
        409,
        'idempotency_in_progress',
        'The same request is already being processed. Please try again shortly.',
      );

    c.header('Idempotent-Replayed', 'true');
    return c.json(
      existing.response_body ?? {},
      existing.response_status as ContentfulStatusCode,
    );
  }
  try {
    await next();
  } catch (error) {
    await query(
      `DELETE FROM idempotency_keys 
       WHERE user_id = $1 AND key = $2`,
      [userId, key],
    );
    throw error;
  }
  if (c.res.status >= 200 && c.res.status < 300) {
    const body = await c.res
      .clone()
      .json()
      .catch(() => null);
    await query(
      `UPDATE idempotency_keys 
       SET status = $3, response_status = $4, response_body = $5 
       WHERE user_id = $1 AND key = $2`,
      [userId, key, 'completed', c.res.status, body],
    );
  } else {
    await query(
      `DELETE FROM idempotency_keys 
       WHERE user_id = $1 AND key = $2`,
      [userId, key],
    );
  }
});
