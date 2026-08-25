// Native (Android/iOS) connection. Metro resolves `./client` to this file
// automatically on native platforms via its platform-extension convention —
// see client.web.ts for the counterpart. Nothing outside apps/native/db
// should import drizzle-orm or expo-sqlite directly — the ingestion/query
// interface (see db/index.ts once it lands) is the only intended surface.
import { getRandomBytes } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { deleteDatabaseSync, openDatabaseSync } from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import * as schema from "./schema";
import { copyLegacyTables, type SQLiteValue, type SyncSqlite } from "./legacy-migration";
import { initializeNativeDatabase } from "./native-init";

const LEGACY_DB_NAME = "zeeya.db";
const SECURE_DB_NAME = "zeeya-secure.db";
const DATABASE_KEY_ITEM = "zeeya.database-key.v1";
const LEGACY_MIGRATION_ITEM = "zeeya.database-migrated.v1";
const TABLE_COPY_ORDER = [
  "sms_ledger",
  "identity_conflicts",
  "sync_checkpoint",
  "local_settings",
  "accounts",
  "balance_readings",
  "transactions",
  "activity",
  "mandates",
  "mandate_events",
] as const;

function databaseKey(): string {
  const stored = SecureStore.getItem(DATABASE_KEY_ITEM);
  if (stored) {
    if (!/^[0-9a-f]{64}$/i.test(stored)) throw new Error("Stored database key is malformed.");
    return stored;
  }

  const generated = Array.from(getRandomBytes(32), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  SecureStore.setItem(DATABASE_KEY_ITEM, generated, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  return generated;
}

export const sqlite = openDatabaseSync(SECURE_DB_NAME, { enableChangeListener: true });
sqlite.execSync(`PRAGMA key = "x'${databaseKey()}'";`);
sqlite.execSync("PRAGMA cipher_memory_security = ON;");
initializeNativeDatabase(sqlite);

export const db = drizzle(sqlite, { schema });

export type Database = typeof db;

function asSyncSqlite(database: ReturnType<typeof openDatabaseSync>): SyncSqlite {
  return {
    execSync: (source) => database.execSync(source),
    getAllSync: <T>(source: string, ...params: SQLiteValue[]) =>
      database.getAllSync<T>(source, ...params),
    runSync: (source: string, ...params: SQLiteValue[]) => {
      database.runSync(source, ...params);
    },
  };
}

// Called only after the secure database's Drizzle migrations have applied.
// Existing plaintext installations are copied transactionally into the new
// SQLCipher file; the plaintext file is deleted only after that copy and its
// durable completion marker both succeed.
export function migrateLegacyDatabaseIfNeeded(): void {
  if (SecureStore.getItem(LEGACY_MIGRATION_ITEM) === "done") return;

  const legacy = openDatabaseSync(LEGACY_DB_NAME);
  try {
    copyLegacyTables(asSyncSqlite(legacy), asSyncSqlite(sqlite), TABLE_COPY_ORDER);
  } finally {
    legacy.closeSync();
  }
  deleteDatabaseSync(LEGACY_DB_NAME);
  // Mark completion only after the plaintext file is gone. If deletion
  // fails, the next launch retries instead of permanently leaving an
  // unencrypted copy behind while claiming migration is complete.
  SecureStore.setItem(LEGACY_MIGRATION_ITEM, "done", {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}
