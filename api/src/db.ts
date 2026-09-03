import pg from 'pg';
import { config } from './config.js';

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 5 });
  }
  return pool;
}

export async function query<Row extends pg.QueryResultRow>(
  text: string,
  params: unknown[],
): Promise<Row[]> {
  const result = await getPool().query<Row>(text, params);
  return result.rows;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
