import { createMiddleware } from 'hono/factory';
import { AppError } from '../errors.js';
import { verifyAccess, type Role } from '../modules/auth/tokens.js';

export interface AuthUser {
  id: string;
  role: Role;
}
export type AuthEnv = { Variables: { user: AuthUser } };

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ')
    ? header.slice('Bearer '.length)
    : null;
  if (!token) throw new AppError(401, 'unauthorized', 'Login is required.');
  const claims = await verifyAccess(token);
  if (!claims)
    throw new AppError(401, 'token_invalid', 'The token is expired or invalid');
  c.set('user', { id: claims.sub, role: claims.role });
  await next();
});

export const requireRole = (role: Role) =>
  createMiddleware<AuthEnv>(async (c, next) => {
    if (c.get('user').role !== role)
      throw new AppError(403, 'forbidden', 'Not authroized');
    await next();
  });
