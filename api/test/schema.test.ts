import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initConfig } from '../src/config.js';
import { closePool, query } from '../src/db.js';
import { UserRow } from '../src/modules/auth/auth.repo.js';
import { IssueEventRow } from '../src/modules/issues/event.repo.js';
import { IssueRow } from '../src/modules/issues/issue.repo.js';

const tables = {
  users: UserRow,
  issues: IssueRow,
  issue_events: IssueEventRow,
};

beforeAll(() => {
  initConfig();
});
afterAll(async () => {
  await closePool();
});

describe('row types match the live schema', () => {
  for (const [table, row] of Object.entries(tables)) {
    it(table, async () => {
      const columns = await query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [table],
      );
      expect(Object.keys(row.shape).sort()).toEqual(
        columns.map((c) => c.column_name).sort(),
      );
    });
  }
});
