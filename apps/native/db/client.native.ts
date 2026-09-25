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

export const sqlite = openDatabaseSync(SECURE_DB_NAME, { enableChangeListener: true });
sqlite.execSync(`PRAGMA key = "x'${databaseKey()}'";`);
sqlite.execSync("PRAGMA cipher_memory_security = ON;");
initializeNativeDatabase(sqlite);
repairLegacyNativeSchema(sqlite);

export const db = drizzle(sqlite, { schema });

export type Database = typeof db;
