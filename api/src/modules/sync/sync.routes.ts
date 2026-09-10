import { Hono } from 'hono';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { requireAuth, type AuthEnv } from '../../middleware/auth.js';
import { validate } from '../../validate.js';
import { listChangedSince } from '../issues/issue.repo.js';
import type { SyncCursor } from '../issues/issue.repo.js';

const ChangesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
const TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;
const CursorSchema = z.object({
  updatedAt: z.string().regex(TIMESTAMP),
  id: z.uuid(),
});

export const encodeCursor = (curosr: SyncCursor): string =>
  Buffer.from(JSON.stringify(curosr)).toString('base64url');
export function decodeCursor(raw: string): SyncCursor {
  try {
    return CursorSchema.parse(
      JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')),
    );
  } catch {
    throw new AppError(400, 'bad_cursor', 'The cursor is invalid.');
  }
}

export const syncRoutes = new Hono<AuthEnv>();
syncRoutes.use('*', requireAuth);

syncRoutes.get('/changes', validate('query', ChangesQuerySchema), async (c) => {
  const { cursor, limit } = c.req.valid('query');
  const { items, last } = await listChangedSince(
    cursor ? decodeCursor(cursor) : null,
    limit,
  );
  return c.json({
    items,
    cursor: last ? encodeCursor(last) : (cursor ?? null),
    hasMore: items.length === limit,
  });
});
