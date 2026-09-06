import { query } from '../../db.js';
import type { Role } from './tokens.js';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  role: Role;
  created_at: Date;
  deleted_at: Date | null;
}

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

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const rows = await query<UserRow>(
    'SELECT * FROM users WHERE email = $1 AND deleted_at is NULL',
    [email],
  );
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const rows = await query<UserRow>(
    'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
  return rows[0] ?? null;
}

export async function countUsers(): Promise<number> {
  const rows = await query<{ count: string }>(
    'SELECT count(*)::text AS count FROM users WHERE deleted_at IS NULL',
  );
  return Number(rows[0]?.count ?? '0');
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  displayName: string;
  role: Role;
}): Promise<UserRow> {
  const rows = await query<UserRow>(
    'INSERT INTO users (email, password_hash, display_name, role) VALUES ($1, $2, $3, $4) RETURNING *',
    [input.email, input.passwordHash, input.displayName, input.role],
  );
  const row = rows[0];
  if (!row) throw new Error('INSERT user did not return a row.');
  return row;
}

export async function countManagers(): Promise<number> {
  const rows = await query<{ count: string }>(
    "SELECT count(*)::text AS count FROM users WHERE role = 'manager' AND deleted_at IS NULL",
  );
  return Number(rows[0]?.count ?? '0');
}

export async function softDeleteUser(id: string): Promise<void> {
  await query(
    `UPDATE users 
    SET deleted_at = now(),
        email = 'deleted+' || id::text || '@invalid',
        display_name = 'Deleted User',
        password_hash = ''
    WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
}
