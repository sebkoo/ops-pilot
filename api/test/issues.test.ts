import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { initConfig } from '../src/config.js';
import { closePool } from '../src/db.js';
import { jsonHeaders, registerUser } from './support/users.js';

let headers: Record<string, string> = { 'content-type': 'application/json' };

const json = (body: unknown, method = 'POST'): RequestInit => ({
  method,
  headers,
  body: JSON.stringify(body),
});
const read = <T>(res: Response) => res.json() as Promise<T>;

beforeAll(async () => {
  initConfig();
  const email = `test-${Date.now()}@test.com`;
  const res = await app.request(
    '/auth/register',
    json({ email, password: 'password', displayName: 'Tester' }),
  );
  if (res.status !== 201)
    throw new Error(`register failed: ${res.status} ${await res.text()}`);
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

  it('creates, reads, updates, and handles conflicts', async () => {
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

  it('refuses to move an issue out of a terminal status', async () => {
    const created = await app.request(
      '/issues',
      json({
        title: 'Terminal status issue',
        category: 'equipment',
        priority: 'low',
        location: 'Test store',
      }),
    );
    const issue = await read<{ id: string }>(created);
    let version = 1;
    for (const status of ['assigned', 'in_progress', 'resolved'] as const) {
      const step = await app.request(
        `/issues/${issue.id}`,
        json({ version, status }, 'PATCH'),
      );
      expect(step.status).toBe(200);
      version = (await read<{ version: number }>(step)).version;
    }
    const after = await app.request(
      `/issues/${issue.id}`,
      json({ version, status: 'assigned' }, 'PATCH'),
    );
    expect(after.status).toBe(422);
    expect((await read<{ error: { code: string } }>(after)).error.code).toBe(
      'invalid_transition',
    );
  });

  it('lets only the creator or a manager edit an issue', async () => {
    const owner = await registerUser(app, 'staff', 'owner');
    const intruder = await registerUser(app, 'staff', 'intruder');
    const boss = await registerUser(app, 'manager', 'boss');
    const created = await app.request('/issues', {
      method: 'POST',
      headers: jsonHeaders(owner.token),
      body: JSON.stringify({
        title: 'Issue owned by someone else',
        category: 'safety',
        priority: 'medium',
        location: 'Test store',
      }),
    });
    const issue = await read<{ id: string; version: number }>(created);
    const stranger = await app.request(`/issues/${issue.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(intruder.token),
      body: JSON.stringify({ version: issue.version, status: 'assigned' }),
    });
    expect(stranger.status).toBe(403);
    expect((await read<{ error: { code: string } }>(stranger)).error.code).toBe(
      'not_owner',
    );
    const manager = await app.request(`/issues/${issue.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(boss.token),
      body: JSON.stringify({ version: issue.version, status: 'assigned' }),
    });
    expect(manager.status).toBe(200);
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
