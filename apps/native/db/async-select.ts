// Drizzle as a query BUILDER, expo-sqlite's async API as the EXECUTOR.
//
// drizzle-orm/expo-sqlite runs every query synchronously on the JS thread
// (the driver is sync-only — an `await` in front of it changes nothing), so a
// screen read built with Drizzle blocks rendering while SQLCipher decrypts
// pages. Reads keep Drizzle's typed predicates (keyset and(), or(), lt()) but
// compile them with .toSQL() and run them through getAllAsync, which does the
// work on the native side.
//
// Each selected column is aliased to its field name, so result rows come
// back keyed exactly like Drizzle's own select({...}) — and a join selecting
// two same-named columns (activity.id, transactions.id) can't collide.
import { sql, type Column, type SQL } from "drizzle-orm";

import { sqlite } from "./client";
import type { AsyncQueryClient } from "./queries";

export function aliasedColumns<T extends Record<string, Column>>(
  columns: T,
): { [K in keyof T]: SQL.Aliased<unknown> } {
  return Object.fromEntries(
    Object.entries(columns).map(([key, column]) => [key, sql`${column}`.as(key)]),
  ) as { [K in keyof T]: SQL.Aliased<unknown> };
}

function requireSqlite(): AsyncQueryClient {
  if (!sqlite) {
    throw new Error(
      "Local database is not available on this platform (see db/client.web.ts) — " +
        "these queries are Android-only, same as the rest of apps/native/db.",
    );
  }
  return sqlite;
}

type BindValue = string | number | null | boolean | Uint8Array | ArrayBuffer;

/** Runs a Drizzle-built SELECT off the JS thread; rows are keyed by alias. */
export function selectAsync<Row>(query: { toSQL(): { sql: string; params: unknown[] } }): Promise<Row[]> {
  const compiled = query.toSQL();
  return requireSqlite().getAllAsync<Row>(compiled.sql, compiled.params as BindValue[]);
}
