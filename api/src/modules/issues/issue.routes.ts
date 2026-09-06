import { Hono } from 'hono';
import { AppError } from '../../errors.js';
import { validate } from '../../validate.js';
import { z } from 'zod';
import { requireAuth, type AuthEnv } from '../../middleware/auth.js';
import { recordEvent } from './event.repo.js';
import {
  ALLOWED_TRANSITIONS,
  CreateISsueSchema,
  ListIssuesQuerySchema,
  UpdateIssueSchema,
} from './issue.schema.js';
import {
  getIssue,
  insertIssue,
  listIssues,
  updateIssue,
} from './issue.repo.js';
import type { Cursor } from './issue.repo.js';

export const issueRoutes = new Hono<AuthEnv>();
issueRoutes.use('*', requireAuth);

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
  } catch (err) {
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

issueRoutes.post('/', validate('json', CreateISsueSchema), async (c) => {
  const body = c.req.valid('json');
  const issue = await insertIssue({
    ...body,
    id: body.id ?? crypto.randomUUID(),
    createdBy: c.get('user').id,
  });
  await recordEvent(issue.id, c.get('user').id, 'issue_created', {
    title: issue.title,
  });
  return c.json(issue, 201);
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
      `Issue has was updated elsewhere first.`,
      { current: result.current },
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
