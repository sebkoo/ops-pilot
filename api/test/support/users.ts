import type { Hono } from 'hono';
import { query } from '../../src/db.js';
import type { ErrorBody } from '../../src/errors.js';

let ipCounter = 0;

export const freshIp = () => `203.0.113.${(ipCounter++ % 250) + 1}`;
export const uniqueEmail = (label: string) =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;

export const jsonHeaders = (token?: string, extra: Record<string, string> = {}) => ({
  'content-type': 'application/json',
  'x-forwarded-for': freshIp(),
  ...(token ? { authorization: `Bearer ${token}` } : {}),
  ...extra,
});

export const bodyOf = async <T>(res: Response): Promise<T> => (await res.json()) as T;
// One-word error code in the response: this is usually all the tests actually care about.
export const errorCodeOf = async (res: Response): Promise<string> =>
  (await bodyOf<ErrorBody>(res)).error.code;
// The ID of the object just created: when the rest of the response body is not needed
export const idOf = async (res: Response): Promise<string> =>
  (await bodyOf<{ id: string }>(res)).id;
export interface TestUser {
  id: string;
  email: string;
  token: string;
  refreshToken: string;
}

export async function registerUser(
  app: Hono,
  role: 'staff' | 'manager' = 'staff',
  label: string = role,
): Promise<TestUser> {
  const email = uniqueEmail(label);
  const password = 'password';
  const res = await app.request('/auth/register', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      email,
      password,
      displayName: `test ${label}`,
    }),
  });

  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${await res.text()}`);
  let body = (await res.json()) as {
    user: { id: string; role: string };
    tokens: {
      accessToken: string;
      refreshToken: string;
    };
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
      body: JSON.stringify({
        email,
        password,
      }),
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

// Creates an issue and advances it to resolved: invoices can only be linked to resolved issues.
export async function createResolvedIssue(
  app: Hono,
  manager: TestUser,
): Promise<{
  id: string;
  version: number;
}> {
  const headers = jsonHeaders(manager.token);
  const created = await app.request('/issues', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: 'Freezer compressor repair',
      category: 'equipment',
      priority: 'high',
      location: 'Store 128',
    }),
  });
  let issue = (await created.json()) as {
    id: string;
    version: number;
  };
  for (const step of [
    { status: 'assigned', assignee: 'Minsoo Kim' },
    { status: 'in_progress' },
    { status: 'resolved' },
  ]) {
    const res = await app.request(`/issues/${issue.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        version: issue.version,
        ...step,
      }),
    });
    if (res.status !== 200)
      throw new Error(`transition to ${step.status} failed: ${res.status} ${await res.text()}`);
    issue = (await res.json()) as {
      id: string;
      version: number;
    };
  }
  return issue;
}
