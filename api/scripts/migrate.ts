import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { initConfig } from '../src/config.js';

const config = initConfig();
const dir = path.resolve('db/migrations');
const client = new pg.Client({ connectionString: config.DATABASE_URL });

await client.connect();
await client.query(
  `CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
);
const appliedRows = await client.query<{ name: string }>(
  'SELECT name FROM schema_migrations',
);
const applied = new Set(appliedRows.rows.map((row) => row.name));
const files = (await readdir(dir))
  .filter((file) => file.endsWith('.sql'))
  .sort();

for (const file of files) {
  if (applied.has(file)) {
    console.log(`skip  ${file}`);
    continue;
  }
  const sql = await readFile(path.join(dir, file), 'utf8');
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [
      file,
    ]);
    await client.query('COMMIT');
    console.log(`apply ${file}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

await client.end();
