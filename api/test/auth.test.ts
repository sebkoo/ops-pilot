import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { initConfig } from '../src/config.js';
import { closePool } from '../src/db.js';
import { jsonHeaders, uniqueEmail } from './support/users.js';

beforeAll(() => {
  initConfig();
});
afterAll(async () => {
  await closePool();
});

const password = 'password';
const post = (path: string, body: unknown, token?: string) =>
  app.request(path, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });
const codeOf = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code;
type AuthBody = {
  user: {
    id: string;
    email: string;
    role: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
};

describe('auth (4.4)', () => {
  it(`Registration contract:
  201 with user and tokens (15-minute access token), 
  lowercase email normalization, 
  409 for duplicates, 
  400 for a short password, 
  and no password hash leakage`, async () => {
    const email = uniqueEmail('Signup');
    const res = await post('/auth/register', {
      email: email.toUpperCase(),
      password,
      displayName: 'tester',
    });
    expect(res.status).toBe(201);

    const text = await res.text();
    expect(text).not.toContain('password');
    expect(text).not.toContain('hash');

    const body = JSON.parse(text) as AuthBody;
    expect(body.user.email).toBe(email.toUpperCase().toLowerCase());
    expect(['staff', 'manager']).toContain(body.user.role);
    expect(body.tokens.expiresIn).toBe(900);
    expect(body.tokens.accessToken.split('.')).toHaveLength(3);
    expect(body.tokens.refreshToken).not.toBe(body.tokens.accessToken);
    expect(
      (await post('/auth/login', { email: email.toLowerCase(), password }))
        .status,
    ).toBe(200);

    const again = await post('/auth/register', {
      email,
      password,
      displayName: 'Second User',
    });
    expect(again.status).toBe(409);
    expect(await codeOf(again)).toBe('email_taken');

    const short = await post('/auth/register', {
      email: uniqueEmail('short'),
      password: 'abc',
      displayName: 'Too Short',
    });
    expect(short.status).toBe(400);
    expect(await codeOf(short)).toBe('validation_error');
  });

  it(`Uses the same 401 invalid_credentials response for a wrong password 
    and a nonexistent email without revealing account existence`, async () => {
    const email = uniqueEmail('login');
    await post('/auth/register', { email, password, displayName: 'Tester' });
    const wrong = await post('/auth/login', {
      email,
      password: 'wrong-password-1',
    });
    const nobody = await post('/auth/login', {
      email: uniqueEmail('nobody'),
      password,
    });
    expect(wrong.status).toBe(401);
    expect(nobody.status).toBe(401);
    expect(((await wrong.json()) as { error: unknown }).error).toEqual(
      ((await nobody.json()) as { error: unknown }).error,
    );
  });

  it(`Tokens have distinct types - only refresh tokens can obtain a new token pair, and 
    using an access token as a refresh token or a refresh token as a Bearer token returns 401`, async () => {
    const reg = (await (
      await post('/auth/register', {
        email: uniqueEmail('refresh'),
        password,
        displayName: 'Tester',
      })
    ).json()) as AuthBody;
    const ok = await post('/auth/refresh', {
      refreshToken: reg.tokens.refreshToken,
    });
    expect(ok.status).toBe(200);

    const next = (await ok.json()) as AuthBody;
    expect(next.user.id).toBe(reg.user.id);
    expect(next.tokens.accessToken.split('.')).toHaveLength(3);

    const wrongType = await post('/auth/refresh', {
      refreshToken: reg.tokens.accessToken,
    });
    expect(wrongType.status).toBe(401);
    expect(await codeOf(wrongType)).toBe('refresh_invalid');
    expect(
      (await post('/auth/refresh', { refreshToken: 'not.a.jwt' })).status,
    ).toBe(401);

    const me = await app.request('/auth/me', {
      headers: jsonHeaders(reg.tokens.accessToken),
    });
    expect(me.status).toBe(200);
    expect(((await me.json()) as { id: string }).id).toBe(reg.user.id);
    expect(
      (
        await app.request('/auth/me', {
          headers: jsonHeaders(reg.tokens.refreshToken),
        })
      ).status,
    ).toBe(401);
    expect(
      (await app.request('/auth/me', { headers: jsonHeaders() })).status,
    ).toBe(401);
  });
});
