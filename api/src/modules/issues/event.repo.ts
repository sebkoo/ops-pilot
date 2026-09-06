import { unknown } from 'zod';
import { query } from '../../db.js';

export type EventKind =
  | 'issue_created'
  | 'issue_updated'
  | 'status_changed'
  | 'ai_suggestion_created'
  | 'ai_suggestion_applied';

export async function recordEvent(
  issueId: string,
  actorId: string | null,
  kind: EventKind,
  payload: Record<string, unknown>,
): Promise<void> {
  await query(
    'INSERT INTO issue_events (issue_id, actor_id, kind, payload) VALUES ($1, $2, $3, $4)',
    [issueId, actorId, kind, payload],
  );
}

export async function listEvents(issueId: string) {
  return query<{
    id: string;
    kind: EventKind;
    actor_id: string | null;
    paylod: Record<string, unknown>;
    created_at: Date;
  }>(
    'SELECT id, kind, actor_id, payload, created_at FROM issue_events WHERE issue_id = $1 ORDER BY id',
    [issueId],
  );
}
