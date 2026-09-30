// The two connections (db/client.native.ts) behind one guard each. On web
// (db/client.web.ts) there is no local database, and every call says so the
// same way instead of each query file carrying its own copy of the check.
import { db, sqlite } from "./client";
import type { Database } from "./client.native";
import type { AsyncQueryClient } from "./queries";

function unavailable(): Error {
  return new Error(
    "The local database is not available on this platform (see db/client.web.ts).",
  );
}

/** The read-only connection, for every async screen read. */
export function readClient(): AsyncQueryClient {
  if (!sqlite) throw unavailable();
  return sqlite;
}

/** The writer: migrations, ingestion, projection publishes, user settings. */
export function writeDb(): Database {
  if (!db) throw unavailable();
  return db;
}
