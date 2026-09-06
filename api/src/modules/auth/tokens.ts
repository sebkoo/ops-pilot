import { sign, verify } from 'hono/jwt';
import { config } from '../../config.js';

export type Role = 'staff' | 'manager';

export interface AccessClaims {
  sub: string;
  role: Role;
  type: 'access';
  iat: number;
  exp: number;
}
export interface RefreshClaims {
  sub: string;
  type: 'refresh';
  iat: number;
  exp: number;
}

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

async function verifyType<T extends { type: string }>(
  token: string,
  type: T['type'],
): Promise<T | null> {
  try {
    const payload = await verify(token, config.JWT_SECRET, 'HS256');
    return payload.type === type ? (payload as unknown as T) : null;
  } catch {
    return null;
  }
}

export const verifyAccess = (token: string) =>
  verifyType<AccessClaims>(token, 'access');
export const verifyRefresh = (token: string) =>
  verifyType<RefreshClaims>(token, 'refresh');
