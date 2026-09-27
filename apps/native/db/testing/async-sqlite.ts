// Test-only: expo-sqlite's async read surface over a better-sqlite3
// connection, for vi.mock("./client") stand-ins. Production reads run through
// `sqlite.getAllAsync` (db/async-select.ts, db/queries*.ts), so a test that
// only mocked the sync Drizzle `db` would fail on the async path — or worse,
// silently read a different connection.
import type Database from "better-sqlite3";

type Params = readonly unknown[];

export function asyncSqlite(raw: Database.Database) {
  return {
    getAllAsync: async <T>(source: string, params: Params = []): Promise<T[]> =>
      raw.prepare(source).all(...params) as T[],
    getFirstAsync: async <T>(source: string, params: Params = []): Promise<T | null> =>
      (raw.prepare(source).get(...params) as T | undefined) ?? null,
  };
}
