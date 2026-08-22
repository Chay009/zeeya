// The on-device SQLite connection + migrator. Nothing outside apps/native/db
// should import drizzle-orm or expo-sqlite directly — the ingestion/query
// interface (see db/index.ts once it lands) is the only intended surface.
//
// Web is not initialized here: expo-sqlite's web backend runs SQLite in a
// Web Worker over wa-sqlite, which needs SharedArrayBuffer — only available
// with COOP/COEP response headers this app doesn't serve, and there is no
// SMS data source on web to persist anyway (see lib/sms.ts's
// isSmsReadSupported — SMS reading is Android-only by OS design). See
// db/provider.tsx for how callers are expected to handle Platform.OS==="web".
import { Platform } from "react-native";
import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import * as schema from "./schema";

const DB_NAME = "zeeya.db";

export const sqlite: SQLiteDatabase | null =
  Platform.OS === "web" ? null : openDatabaseSync(DB_NAME, { enableChangeListener: true });

// SQLite ignores declared foreign keys (and their ON DELETE CASCADE) unless
// each connection explicitly turns enforcement on — it defaults to off for
// backwards compatibility with pre-3.6.19 SQLite, not something the schema
// file can request on its own.
sqlite?.execSync("PRAGMA foreign_keys = ON;");

export const db = sqlite ? drizzle(sqlite, { schema }) : null;

export type Database = NonNullable<typeof db>;
