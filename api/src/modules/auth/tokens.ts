import { sign, verify } from 'hono/jwt';
import { z } from 'zod';
import { config } from '../../config.js';

export const ROLES = ['staff', 'manager'] as const;
export type Role = (typeof ROLES)[number];

const AccessClaims = z.object({
  sub: z.string(),
  role: z.enum(ROLES),
  type: z.literal('access'),
  iat: z.number(),
  exp: z.number(),
});
const RefreshClaims = z.object({
  sub: z.string(),
  type: z.literal('refresh'),
  iat: z.number(),
  exp: z.number(),
});
export type AccessClaims = z.infer<typeof AccessClaims>;
export type RefreshClaims = z.infer<typeof RefreshClaims>;

const ACCESS_TTL = 15 * 60;
const REFRESH_TTL = 30 * 24 * 60 * 60;
const nowSeconds = () => Math.floor(Date.now() / 1000);

export async function issueTokens(user: { id: string; role: Role }) {
  const iat = nowSeconds();
  const accessToken = await sign(
    {
      sub: user.id,
      role: user.role,
      type: 'access',
      iat,
      exp: iat + ACCESS_TTL,
    },
    config.JWT_SECRET,
  );
  const refreshToken = await sign(
    { sub: user.id, type: 'refresh', iat, exp: iat + REFRESH_TTL },
    config.JWT_SECRET,
  );
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL };
}

async function verifyWith<S extends z.ZodType>(
  schema: S,
  token: string,
): Promise<z.infer<S> | null> {
  try {
    const parsed = schema.safeParse(await verify(token, config.JWT_SECRET, 'HS256'));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const verifyAccess = (token: string) => verifyWith(AccessClaims, token);
export const verifyRefresh = (token: string) => verifyWith(RefreshClaims, token);
