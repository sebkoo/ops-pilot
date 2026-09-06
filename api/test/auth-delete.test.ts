import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { initConfig } from '../src/config.js';
import { closePool } from '../src/db.js';

const json = (body: unknown, method = 'POST', token?: string): RequestInit => ({
  method,
  headers: {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify(body),
});
const readOk = async <T>(res: Response, expected: number): Promise<T> => {
  const text = await res.text();
  if (res.status !== expected)
    throw new Error(`expected ${expected}, got ${res.status}: ${text}`);
  return JSON.parse(text) as T;
};

const uniqueEmail = (label: string) =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

beforeAll(() => {
  initConfig();
});
afterAll(async () => {
  await closePool();
});

describe('account deletion', () => {
  it('cannot delete an account with an incorrect password', async () => {
    const email = uniqueEmail('wrong-password');
    const created = await readOk<{ tokens: { accessToken: string } }>(
      await app.request(
        '/auth/register',
        json({
          email,
          password: 'correct-horse-battery',
          displayName: 'deleted tester',
        }),
      ),
      201,
    );
    const res = await app.request(
      '/auth/me',
      json(
        {
          password: 'wrong-password-1',
        },
        'DELETE',
        created.tokens.accessToken,
      ),
    );
    expect(res.status).toBe(401);
  });

  it('blocks login after deletion and allows re-registration with the same email', async () => {
    const email = uniqueEmail('re-register');
    const password = 'correct-hourse-battery';

    const created = await readOk<{ tokens: { accessToken: string } }>(
      await app.request(
        '/auth/register',
        json({ email, password, displayName: 'deleted tester' }),
      ),
      201,
    );
    const deleted = await app.request(
      '/auth/me',
      json({ password }, 'DELETE', created.tokens.accessToken),
    );
    expect(deleted.status).toBe(204);

    const login = await app.request('/auth/login', json({ email, password }));
    expect(login.status).toBe(401);

    const again = await app.request(
      '/auth/register',
      json({ email, password, displayName: 'Registered Again' }),
    );
    expect(again.status).toBe(201);
  });
});
