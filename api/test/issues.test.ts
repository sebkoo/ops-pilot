import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initConfig } from '../src/config.js';
import { app } from '../src/app.js';
import { closePool } from '../src/db.js';

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const read = <T>(res: Response) => res.json() as Promise<T>;

beforeAll(() => {
  initConfig();
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

    const fetched = await app.request(`/issues/${issue.id}`);
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
});
