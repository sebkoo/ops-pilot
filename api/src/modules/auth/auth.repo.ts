import { z } from 'zod';
import { one, query } from '../../db.js';
import type { Role } from './tokens.js';

export const UserRow = z.object({
  id: z.string(),
  email: z.string(),
  password_hash: z.string(),
  display_name: z.string(),
  role: z.enum(['staff', 'manager']),
  created_at: z.date(),
  deleted_at: z.date().nullable(),
});
export type UserRow = z.infer<typeof UserRow>;

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
}

export const toPublicUser = (row: UserRow): PublicUser => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  role: row.role,
});

export const findUserByEmail = (email: string) =>
  one<UserRow>(
    `SELECT * FROM users 
     WHERE email = $1 AND 
      deleted_at is NULL`,
    [email],
  );

export const findUserById = (id: string) =>
  one<UserRow>(
    `SELECT * FROM users 
     WHERE id = $1 AND 
      deleted_at IS NULL`,
    [id],
  );

export async function countUsers(): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT count(*)::text AS count 
     FROM users 
     WHERE deleted_at IS NULL`,
  );
  return Number(rows[0]?.count ?? '0');
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  displayName: string;
  role: Role;
}): Promise<UserRow> {
  const row = await one<UserRow>(
    `INSERT INTO users (
      email, 
      password_hash, 
      display_name, 
      role) 
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [input.email, input.passwordHash, input.displayName, input.role],
  );
  if (!row) throw new Error('INSERT user did not return a row.');
  return row;
}

export async function countManagers(): Promise<number> {
  const row = await one<{ count: string }>(
    `SELECT count(*)::text AS count 
     FROM users 
     WHERE role = 'manager' AND 
      deleted_at IS NULL`,
  );
  return Number(row?.count ?? '0');
}

export async function softDeleteUser(id: string): Promise<void> {
  await query(
    `UPDATE users 
     SET deleted_at = now(),
        email = 'deleted+' 
          || id::text 
          || '@invalid',
        display_name = 'Deleted User',
        password_hash = ''
     WHERE id = $1 AND 
      deleted_at IS NULL`,
    [id],
  );
}
