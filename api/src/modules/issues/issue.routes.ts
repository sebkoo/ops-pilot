import { Hono } from 'hono';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { type AuthEnv, requireAuth } from '../../middleware/auth.js';
import { idempotency } from '../../middleware/idempotency.js';
import { validate } from '../../validate.js';
import { recordEvent } from './event.repo.js';
import type { Cursor } from './issue.repo.js';
import {
  getIssue,
  insertIssue,
  listIssues,
  updateIssue,
} from './issue.repo.js';
import {
  ALLOWED_TRANSITIONS,
  CreateIssueSchema,
  ListIssuesQuerySchema,
  UpdateIssueSchema,
} from './issue.schema.js';

export const issueRoutes = new Hono<AuthEnv>();
issueRoutes.use('*', requireAuth);
issueRoutes.use('*', idempotency);

const TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;
const CursorSchema = z.object({
  createdAt: z.string().regex(TIMESTAMP),
  id: z.uuid(),
});

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(cursor: string): Cursor {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    return CursorSchema.parse(JSON.parse(decoded));
  } catch {
    throw new AppError(400, 'bad_cursor', 'cursor is not valid');
  }
}

issueRoutes.get('/', validate('query', ListIssuesQuerySchema), async (c) => {
  const q = c.req.valid('query');
  const { issues, lastCursor } = await listIssues({
    status: q.status,
    limit: q.limit,
    after: q.cursor ? decodeCursor(q.cursor) : undefined,
  });
  const nextCursor =
    issues.length === q.limit && lastCursor ? encodeCursor(lastCursor) : null;
  return c.json({ issues, nextCursor });
});

issueRoutes.get('/:id', async (c) => {
  const issue = await getIssue(c.req.param('id'));
  if (!issue) {
    throw new AppError(404, 'not_found', `Issue not found`);
  }
  return c.json(issue);
});

issueRoutes.post('/', validate('json', CreateIssueSchema), async (c) => {
  const body = c.req.valid('json');
  const { issue, created } = await insertIssue({
    ...body,
    id: body.id ?? crypto.randomUUID(),
    createdBy: c.get('user').id,
  });
  if (created)
    await recordEvent(issue.id, c.get('user').id, 'issue_created', {
      title: issue.title,
      status: issue.status,
    });
  return c.json(issue, created ? 201 : 200);
});

issueRoutes.patch('/:id', validate('json', UpdateIssueSchema), async (c) => {
  const patch = c.req.valid('json');
  const current = await getIssue(c.req.param('id'));
  const user = c.get('user');
  if (patch.assignee !== undefined && user.role !== 'manager')
    throw new AppError(403, 'forbidden', 'Only managers can assign issues.');
  if (user.role !== 'manager' && current?.createdBy !== user.id)
    throw new AppError(
      403,
      'not_owner',
      'You can only modify issues you created.',
    );

  if (!current) throw new AppError(404, 'not_found', `Issue not found`);
  if (
    patch.status &&
    patch.status !== current.status &&
    ALLOWED_TRANSITIONS[current.status] !== patch.status
  ) {
    throw new AppError(
      422,
      'invalid_transition',
      `Cannot transition from ${current.status} to ${patch.status}`,
    );
  }
  const result = await updateIssue(current.id, patch);
  if (result.kind === 'not_found')
    throw new AppError(404, 'not_found', `Issue not found`);
  if (result.kind === 'conflict')
    throw new AppError(
      409,
      'version_conflict',
      `Someone else updated this issue first.`,
      {
        current: result.current,
      },
    );
  await recordEvent(
    current.id,
    user.id,
    patch.status && patch.status !== current.status
      ? 'status_changed'
      : 'issue_updated',
    { from: current.status, patch },
  );
  return c.json(result.issue);
});
