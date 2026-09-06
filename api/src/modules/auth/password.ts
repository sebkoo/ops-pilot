import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const DUMMY_HASH = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string | null,
): Promise<boolean> {
  const [scheme, salt, hashHex] = (storedHash ?? DUMMY_HASH).split('$');
  if (scheme !== 'scrypt' || !salt || !hashHex) return false;
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  const expected = Buffer.from(hashHex, 'hex');
  return (
    derivedKey.length === expected.length &&
    timingSafeEqual(derivedKey, expected) &&
    storedHash !== null
  );
}
