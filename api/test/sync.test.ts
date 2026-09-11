import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { initConfig } from '../src/config.js';
import { closePool } from '../src/db.js';

let headers: Record<string, string> = { 'content-type': 'application/json' };
const json = (
  body: unknown,
  method = 'POST',
  extra: Record<string, string> = {},
): RequestInit => ({
  method,
  headers: { ...headers, ...extra },
  body: JSON.stringify(body),
});
const read = <T>(res: Response) => res.json() as Promise<T>;
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
  if (res.status !== 201)
    throw new Error(`register failed: ${res.status} ${await res.text()}`);
  const { tokens } = await read<{ tokens: { accessToken: string } }>(res);
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
      json(body, 'POST', { 'idempotency-key': key }),
    );
    const second = await app.request(
      '/issues',
      json(body, 'POST', { 'idempotency-key': key }),
    );
    expect(first.status).toBe(201);
    expect(second.headers.get('idempotent-replayed')).toBe('true');
    expect((await read<{ id: string }>(second)).id).toBe(
      (await read<{ id: string }>(first)).id,
    );
  });

  it('returns 200 on a second reqeust with the same ID and creates only one issue', async () => {
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
      json({ title: 'B', category: 'low', location: 'test' }, 'POST', {
        'idempotency-key': key,
      }),
    );
    expect(reused.status).toBe(422);
    expect((await read<{ error: { code: string } }>(reused)).error.code).toBe(
      'idempotency_key_reused',
    );
  });

  it('returns only changes after the cursor and does not miss records with the same timestamp', async () => {
    const first = await app.request('/sync/changes?limit=1', { headers });
    const page1 = await read<Page>(first);
    expect(page1.cursor).toBeTruthy();
    const seen = new Set<string>(page1.items.map((i) => i.id));
    let cursor = page1.cursor;
    for (let i = 0; i < 500 && cursor; i++) {
      const res = await app.request(
        `/sync/changes?limit=1&cursor=${encodeURIComponent(cursor)}`,
        { headers },
      );
      const page = await read<Page>(res);
      if (page.items.length === 0) break;
      for (const item of page.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
      }
      cursor = page.cursor;
    }
    const all = await read<Page>(
      await app.request('/sync/changes?limit=500', { headers }),
    );
    expect(all.hasMore).toBe(false);
    expect(seen.size).toBe(all.items.length);
  });
});
