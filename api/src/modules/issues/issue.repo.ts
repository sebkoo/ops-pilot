import { z } from 'zod';
import { one, query } from '../../db.js';
import {
  type CreateIssueInput,
  type Issue,
  IssueCategory,
  IssuePriority,
  IssueStatus,
  type UpdateIssueInput,
} from './issue.schema.js';

export const IssueRow = z.object({
  id: z.string(),
  title: z.string(),
  details: z.string(),
  category: IssueCategory,
  priority: IssuePriority,
  status: IssueStatus,
  location: z.string(),
  assignee: z.string().nullable(),
  ai_summary: z.string().nullable(),
  created_by: z.string().nullable(),
  version: z.number(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type IssueRow = z.infer<typeof IssueRow>;

const COLUMNS = Object.keys(IssueRow.shape).join(', ');

function toIssue(row: IssueRow): Issue {
  return {
    id: row.id,
    title: row.title,
    details: row.details,
    category: row.category,
    priority: row.priority,
    status: row.status,
    location: row.location,
    assignee: row.assignee,
    aiSummary: row.ai_summary,
    createdBy: row.created_by,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface ListOptions {
  status?: Issue['status'];
  limit?: number;
  after?: Cursor;
}

export interface Cursor {
  createdAt: string;
  id: string;
}

export async function listIssues(
  options: ListOptions,
): Promise<{ issues: Issue[]; lastCursor: Cursor | null }> {
  const rows = await query<IssueRow & { created_at_exact: string }>(
    `SELECT ${COLUMNS}, created_at::text AS created_at_exact FROM issues
     WHERE ($1::text IS NULL OR status = $1)
     AND ($2::timestamptz IS NULL 
      OR (created_at, id) < ($2::timestamptz, $3::uuid)
     )
     ORDER BY created_at DESC, id DESC
     LIMIT $4`,
    [
      options.status ?? null,
      options.after?.createdAt ?? null,
      options.after?.id ?? null,
      options.limit,
    ],
  );

  const tail = rows.at(-1);
  return {
    issues: rows.map(toIssue),
    lastCursor: tail ? { createdAt: tail.created_at_exact, id: tail.id } : null,
  };
}

export async function getIssue(id: string): Promise<Issue | null> {
  const rows = await query<IssueRow>(
    `SELECT ${COLUMNS} 
     FROM issues 
     WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  return row ? toIssue(row) : null;
}

export async function insertIssue(
  input: CreateIssueInput & { id: string; createdBy: string },
): Promise<{ issue: Issue; created: boolean }> {
  const rows = await query<IssueRow>(
    `INSERT INTO issues (id, title, details, category, priority, status, location, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO NOTHING
     RETURNING ${COLUMNS}`,
    [
      input.id,
      input.title,
      input.details,
      input.category,
      input.priority,
      input.status,
      input.location,
      input.createdBy,
    ],
  );
  const row = rows[0];
  if (row) return { issue: toIssue(row), created: true };
  const existing = await getIssue(input.id);
  if (!existing)
    throw new Error('The INSERT conflicted, but no existing row was found.');
  return { issue: existing, created: false };
}

export type UpdateResult =
  | { kind: 'updated'; issue: Issue }
  | { kind: 'not_found' }
  | { kind: 'conflict'; current: Issue };

export async function updateIssue(
  id: string,
  patch: UpdateIssueInput,
): Promise<UpdateResult> {
  const rows = await query<IssueRow>(
    `UPDATE issues SET 
      title = COALESCE($3, title),
      details = COALESCE($4, details),
      category = COALESCE($5, category),
      priority = COALESCE($6, priority),
      status = COALESCE($7, status),
      location = COALESCE($8, location),
      assignee = CASE WHEN $9::boolean THEN $10 ELSE assignee END,
      version = version + 1,
      updated_at = now()
     WHERE id = $1 AND version = $2
     RETURNING ${COLUMNS}`,
    [
      id,
      patch.version,
      patch.title ?? null,
      patch.details ?? null,
      patch.category ?? null,
      patch.priority ?? null,
      patch.status ?? null,
      patch.location ?? null,
      patch.assignee !== undefined,
      patch.assignee ?? null,
    ],
  );

  const row = rows[0];
  if (row) {
    return { kind: 'updated', issue: toIssue(row) };
  }

  const current = await getIssue(id);

  return current ? { kind: 'conflict', current } : { kind: 'not_found' };
}

export interface SyncCursor {
  updatedAt: string;
  id: string;
}

export async function listChangedSince(
  after: SyncCursor | null,
  limit: number,
): Promise<{ items: Issue[]; last: SyncCursor | null }> {
  const rows = await query<IssueRow & { updated_at_exact: string }>(
    `SELECT ${COLUMNS}, updated_at::text 
     AS updated_at_exact 
     FROM issues
     WHERE ($1::timestamptz IS NULL 
      OR (updated_at, id) > ($1::timestamptz, $2::uuid))
     ORDER BY updated_at ASC, id ASC
     LIMIT $3`,
    [after?.updatedAt ?? null, after?.id ?? null, limit],
  );
  const tail = rows.at(-1);
  return {
    items: rows.map(toIssue),
    last: tail ? { updatedAt: tail.updated_at_exact, id: tail.id } : null,
  };
}
