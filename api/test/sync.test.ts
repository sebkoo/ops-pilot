import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { initConfig } from '../src/config.js';
import { closePool, query } from '../src/db.js';
import { encodeCursor } from '../src/modules/sync/sync.routes.js';
import { bodyOf, errorCodeOf, idOf } from './support/users.js';

let headers: Record<string, string> = { 'content-type': 'application/json' };
const json = (body: unknown, method = 'POST', extra: Record<string, string> = {}): RequestInit => ({
  method,
  headers: { ...headers, ...extra },
  body: JSON.stringify(body),
});

// Creates one issue and returns only its ID
const createIssue = async (title: string): Promise<string> => {
  const res = await app.request(
    '/issues',
    json({
      title,
      category: 'other',
      priority: 'low',
      location: 'test',
    }),
  );
  return idOf(res);
};
type Page = {
  items: Array<{ id: string }>;
  cursor: string | null;
  hasMore: boolean;
};

beforeAll(async () => {
  initConfig();
  const res = await app.request(
    '/auth/register',
    json({
      email: `sync+${Date.now()}@test.com`,
      password: 'password',
      displayName: 'Sync Tester',
    }),
  );
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${await res.text()}`);
  const { tokens } = await bodyOf<{ tokens: { accessToken: string } }>(res);
  headers = { ...headers, authorization: `Bearer ${tokens.accessToken}` };
});
afterAll(async () => {
  await closePool();
});

describe('sync', () => {
  it('replays the same response when the same Idempotency-Key is sent twice', async () => {
    const key = crypto.randomUUID();
    const body = {
      title: 'Duplicate Prevention',
      category: 'other',
      priority: 'low',
      location: 'test',
    };
    const first = await app.request(
      '/issues',
      json(body, 'POST', {
        'idempotency-key': key,
      }),
    );
    const second = await app.request(
      '/issues',
      json(body, 'POST', {
        'idempotency-key': key,
      }),
    );
    expect(first.status).toBe(201);
    expect(second.headers.get('idempotent-replayed')).toBe('true');
    expect(await idOf(second)).toBe(await idOf(first));
  });

  it('returns 200 on a second request with the same ID and creates only one issue', async () => {
    const id = crypto.randomUUID();
    const body = {
      id,
      title: 'Natural Idempotency',
      category: 'other',
      priority: 'low',
      location: 'test',
    };
    expect((await app.request('/issues', json(body))).status).toBe(201);
    expect((await app.request('/issues', json(body))).status).toBe(200);
  });

  it('returns 422 when the same Idempotency-Key is reused with a different request body', async () => {
    const key = crypto.randomUUID();
    await app.request(
      '/issues',
      json(
        {
          title: 'A',
          category: 'other',
          priority: 'low',
          location: 'test',
        },
        'POST',
        { 'idempotency-key': key },
      ),
    );
    const reused = await app.request(
      '/issues',
      json(
        {
          title: 'B',
          category: 'low',
          location: 'test',
        },
        'POST',
        {
          'idempotency-key': key,
        },
      ),
    );
    expect(reused.status).toBe(422);
    expect(await errorCodeOf(reused)).toBe('idempotency_key_reused');
  });

  it('Cursor uses (updated_at, id): no duplicates or missed rows with the same timestamp', async () => {
    const ids: string[] = [];
    for (const title of ['Same Timestamp A', 'Same Timestamp B', 'Same Timestamp C'])
      ids.push(await createIssue(title));
    const [tie] = await query<{ updated_at: string }>(
      `UPDATE issues
       SET updated_at = now()
       WHERE id = ANY($1)
       RETURNING updated_at::text AS updated_at`,
      [ids],
    );
    if (!tie) throw new Error('UPDATE issues did not return a row.');
    let cursor: string | null = encodeCursor({
      updatedAt: tie.updated_at,
      id: '00000000-0000-0000-0000-000000000000',
    });
    const seen: string[] = [];
    for (let i = 0; i < 5 && cursor; i++) {
      const res = await app.request(`/sync/changes?limit=1&cursor=${encodeURIComponent(cursor)}`, {
        headers,
      });
      const page = await bodyOf<Page>(res);
      if (page.items.length === 0) break;
      seen.push(...page.items.map((item) => item.id));
      cursor = page.cursor;
    }
    expect(seen).toEqual([...ids].sort());
  });
});
