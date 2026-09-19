import pg from 'pg';
import { config } from './config.js';

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: config.DATABASE_URL,
      max: 5,
    });
  }
  return pool;
}

export async function query<Row extends pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<Row[]> {
  const result = await getPool().query<Row>(text, params);
  return result.rows;
}

export async function one<Row extends pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<Row | null> {
  const rows = await query<Row>(text, params);
  return rows[0] ?? null;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

// Transaction-scoped database handle: run queries only via its connection, never the pool.
export interface Txn {
  query<Row extends pg.QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<pg.QueryResult<Row>>;
  one<Row extends pg.QueryResultRow>(text: string, params?: unknown[]): Promise<Row | null>;
}

export async function withTransaction<T>(fn: (db: Txn) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  const db: Txn = {
    query: (text, params = []) => client.query(text, params),
    one: async (text, params = []) => (await client.query(text, params)).rows[0] ?? null,
  };

  try {
    await client.query('BEGIN');
    const out = await fn(db);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
