// Native (Android/iOS) connection. Metro resolves `./client` to this file
// automatically on native platforms via its platform-extension convention —
// see client.web.ts for the counterpart. Nothing outside apps/native/db
// should import drizzle-orm or expo-sqlite directly — the ingestion/query
// interface (see db/index.ts once it lands) is the only intended surface.
import { getRandomBytes } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { openDatabaseSync } from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import * as schema from "./schema";
import { initializeNativeDatabase } from "./native-init";
import { repairLegacyNativeSchema } from "./native-schema-compat";

const SECURE_DB_NAME = "zeeya-secure.db";
const DATABASE_KEY_ITEM = "zeeya.database-key.v1";

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

const key = databaseKey();

// The WRITE connection: migrations, ingestion and projection publishes run
// through Drizzle's synchronous API here.
const writer = openDatabaseSync(SECURE_DB_NAME, { enableChangeListener: true });
writer.execSync(`PRAGMA key = "x'${key}'";`);
writer.execSync("PRAGMA cipher_memory_security = ON;");
initializeNativeDatabase(writer);
repairLegacyNativeSchema(writer);

export const db = drizzle(writer, { schema });

// A separate READ connection for every async screen read (getAllAsync).
// expo-sqlite runs *Sync calls on the JS thread and *Async calls on a
// background queue, on whatever connection they're given, with only
// per-statement locking — so on a shared connection a queued read could run
// BETWEEN two statements of a synchronous publish transaction and see its
// uncommitted, half-replaced tables (same connection = no isolation). On
// its own connection under WAL (journal_mode set above, persisted in the
// file), a read only ever sees committed data: the state before a publish
// or after it, never in between. useNewConnection: expo-sqlite otherwise
// hands back the cached writer for the same name. Keyed here (a connection
// expo-sqlite opened itself could not be), and query_only so nothing can
// ever write through it.
const reader = openDatabaseSync(SECURE_DB_NAME, { useNewConnection: true });
reader.execSync(`PRAGMA key = "x'${key}'";`);
reader.execSync("PRAGMA cipher_memory_security = ON;");
reader.execSync("PRAGMA query_only = ON;");

export const sqlite = reader;

export type Database = typeof db;
