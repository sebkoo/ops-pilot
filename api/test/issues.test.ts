import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initConfig } from '../src/config.js';
import { app } from '../src/app.js';
import { closePool } from '../src/db.js';

let headers: Record<string, string> = { 'content-type': 'application/json' };

const json = (body: unknown, method = 'POST') => ({
  method,
  headers,
  body: JSON.stringify(body),
});
const read = <T>(res: Response) => res.json() as Promise<T>;

beforeAll(async () => {
  initConfig();
  const email = `test-${Date.now()}@example.com`;
  const res = await app.request(
    '/auth/register',
    json({ email, password: 'correct-horse-battery', displayName: 'tester' }),
  );
  const { tokens } = await read<{ tokens: { accessToken: string } }>(res);
  headers = { ...headers, authorization: `Bearer ${tokens.accessToken}` };
});
afterAll(async () => {
  await closePool();
});

describe('issues API', () => {
  it('/health responds', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it('creates, reads, updateds, and handles conflicts', async () => {
    const created = await app.request(
      '/issues',
      json({
        title: 'Test issue',
        category: 'safety',
        priority: 'high',
        location: 'Test store',
      }),
    );
    expect(created.status).toBe(201);

    const issue = await read<{ id: string; version: number }>(created);
    expect(issue.version).toBe(1);

    const fetched = await app.request(`/issues/${issue.id}`, { headers });
    expect(fetched.status).toBe(200);

    const patched = await app.request(
      `/issues/${issue.id}`,
      json({ version: 1, status: 'assigned' }, 'PATCH'),
    );
    expect(patched.status).toBe(200);
    expect((await read<{ version: number }>(patched)).version).toBe(2);

    const stale = await app.request(
      `/issues/${issue.id}`,
      json({ version: 1, status: 'in_progress' }, 'PATCH'),
    );
    expect(stale.status).toBe(409);
    expect((await read<{ error: { code: string } }>(stale)).error.code).toBe(
      'version_conflict',
    );

    const skip = await app.request(
      `/issues/${issue.id}`,
      json({ version: 2, status: 'resolved' }, 'PATCH'),
    );
    expect(skip.status).toBe(422);
    expect((await read<{ error: { code: string } }>(skip)).error.code).toBe(
      'invalid_transition',
    );
  });

  it('returns 400 for invalid input', async () => {
    const res = await app.request(
      '/issues',
      json({ title: '', category: 'nope' }),
    );
    expect(res.status).toBe(400);
    const body = await read<{ error: { code: string; details: unknown[] } }>(
      res,
    );
    expect(body.error.code).toBe('validation_error');
    expect(body.error.details.length).toBeGreaterThan(0);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await app.request('/issues');
    expect(res.status).toBe(401);
  });
});
