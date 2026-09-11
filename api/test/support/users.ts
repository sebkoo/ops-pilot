import type { Hono } from 'hono';
import { query } from '../../src/db.js';

let ipCounter = 0;

export const freshIp = () => `203.0.113.${(ipCounter++ % 250) + 1}`;
export const uniqueEmail = (label: string) =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;

export const jsonHeaders = (
  token?: string,
  extra: Record<string, string> = {},
) => ({
  'content-type': 'application/json',
  'x-forwarded-for': freshIp(),
  ...(token ? { authorization: `Bearer ${token}` } : {}),
  ...extra,
});

export interface TestUser {
  id: string;
  email: string;
  token: string;
  refreshToken: string;
}

export async function registerUser(
  app: Hono,
  role: 'staff' | 'manager' = 'staff',
  label = role,
): Promise<TestUser> {
  const email = uniqueEmail(label);
  const password = 'password';
  const res = await app.request('/auth/register', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ email, password, displayName: `test ${label}` }),
  });

  if (res.status !== 201)
    throw new Error(`register failed: ${res.status} ${await res.text()}`);
  let body = (await res.json()) as {
    user: { id: string; role: string };
    tokens: { accessToken: string; refreshToken: string };
  };

  if (role === 'manager' && body.user.role !== 'manager') {
    await query(
      `UPDATE users 
       SET role = 'manager' 
       WHERE id = $1`,
      [body.user.id],
    );
    const login = await app.request('/auth/login', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email, password }),
    });
    body = (await login.json()) as typeof body;
  }

  return {
    id: body.user.id,
    email,
    token: body.tokens.accessToken,
    refreshToken: body.tokens.refreshToken,
  };
}
