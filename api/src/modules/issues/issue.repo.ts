import { query } from '../../db.js';
import type {
  CreateIssueInput,
  Issue,
  UpdateIssueInput,
} from './issue.schema.js';

interface IssueRow {
  id: string;
  title: string;
  details: string;
  category: Issue['category'];
  priority: Issue['priority'];
  status: Issue['status'];
  location: string;
  assignee: string | null;
  ai_summary: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  'id, title, details, category, priority, status, location, assignee, ai_summary, version, created_at, updated_at';

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
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
     AND ($2::timestamptz IS NULL OR (created_at, id) < ($2::timestamptz, $3::uuid))
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
    `SELECT ${COLUMNS} FROM issues WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  return row ? toIssue(row) : null;
}

export async function insertIssue(
  input: CreateIssueInput & { id: string },
): Promise<Issue> {
  const rows = await query<IssueRow>(
    `INSERT INTO issues (id, title, details, category, priority, location)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${COLUMNS}`,
    [
      input.id,
      input.title,
      input.details,
      input.category,
      input.priority,
      input.location,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error('INSERT did not return a row.');
  return toIssue(row);
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
