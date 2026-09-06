import { Hono } from 'hono';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { validate } from '../../validate.js';
import { requireAuth, type AuthEnv } from '../../middleware/auth.js';
import { hashPassword, verifyPassword } from './password.js';
import { issueTokens, verifyRefresh } from './tokens.js';
import {
  countManagers,
  countUsers,
  createUser,
  findUserByEmail,
  findUserById,
  softDeleteUser,
  toPublicUser,
} from './auth.repo.js';

const CredentialsSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(200),
});

const RegisterSchema = CredentialsSchema.extend({
  displayName: z.string().trim().min(1).max(60),
});

const RefreshSchema = z.object({ refreshToken: z.string().min(1) });

const DeleteAccountSchema = z.object({ password: z.string().min(1) });

export const authRoutes = new Hono<AuthEnv>();

authRoutes.post('/register', validate('json', RegisterSchema), async (c) => {
  const { email, password, displayName } = c.req.valid('json');
  if (await findUserByEmail(email))
    throw new AppError(409, 'email_taken', 'This email is already registered.');
  const role = (await countUsers()) === 0 ? 'manager' : 'staff';
  const user = await createUser({
    email,
    passwordHash: await hashPassword(password),
    displayName,
    role,
  });
  return c.json(
    { user: toPublicUser(user), tokens: await issueTokens(user) },
    201,
  );
});

authRoutes.post('/login', validate('json', CredentialsSchema), async (c) => {
  const { email, password } = c.req.valid('json');
  const user = await findUserByEmail(email);
  const ok = await verifyPassword(password, user?.password_hash ?? null);
  if (!user || !ok)
    throw new AppError(
      401,
      'invalid_credentials',
      'The email or password is incorrect.',
    );
  return c.json({ user: toPublicUser(user), tokens: await issueTokens(user) });
});

authRoutes.post('/refresh', validate('json', RefreshSchema), async (c) => {
  const claims = await verifyRefresh(c.req.valid('json').refreshToken);
  const user = claims ? await findUserById(claims.sub) : null;
  if (!user) throw new AppError(401, 'refresh_invalid', 'Plesae log in again.');
  return c.json({ user: toPublicUser(user), tokens: await issueTokens(user) });
});

authRoutes.get('/me', requireAuth, async (c) => {
  const user = await findUserById(c.get('user').id);
  if (!user) throw new AppError(404, 'not_found', 'No user found');
  return c.json(toPublicUser(user));
});

authRoutes.delete(
  '/me',
  requireAuth,
  validate('json', DeleteAccountSchema),
  async (c) => {
    const { password } = c.req.valid('json');
    const user = await findUserById(c.get('user').id);
    if (!user)
      throw new AppError(404, 'not_found', 'Account could not be found.');
    if (!(await verifyPassword(password, user.password_hash)))
      throw new AppError(
        401,
        'invalid_credentials',
        'The password is incorrect.',
      );
    if (
      user.role === 'manager' &&
      (await countUsers()) > 1 &&
      (await countManagers()) <= 1
    ) {
      throw new AppError(
        409,
        'last_manager',
        'The last maanger cannot delete their account. Please create another.',
      );
    }
    await softDeleteUser(user.id);
    return c.body(null, 204);
  },
);
