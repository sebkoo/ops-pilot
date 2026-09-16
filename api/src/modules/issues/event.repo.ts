import { z } from 'zod';
import { query } from '../../db.js';

export type EventKind =
  | 'issue_created'
  | 'issue_updated'
  | 'status_changed'
  | 'ai_suggestion_created'
  | 'ai_suggestion_applied';

export const IssueEventRow = z.object({
  id: z.string(),
  issue_id: z.string(),
  actor_id: z.string().nullable(),
  kind: z.string(),
  payload: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.date(),
});
export type IssueEventRow = z.infer<typeof IssueEventRow>;

export async function recordEvent(
  issueId: string,
  actorId: string | null,
  kind: EventKind,
  payload: Record<string, unknown>,
): Promise<void> {
  await query(
    `INSERT INTO issue_events (issue_id, actor_id, kind, payload) 
     VALUES ($1, $2, $3, $4)`,
    [issueId, actorId, kind, payload],
  );
}

export const listEvents = (issueId: string) =>
  query<IssueEventRow>(
    `SELECT id, kind, actor_id, payload, created_at 
     FROM issue_events 
     WHERE issue_id = $1
     ORDER BY id`,
    [issueId],
  );
