// The on-device SQLite connection + migrator. Nothing outside apps/native/db
// should import drizzle-orm or expo-sqlite directly — the ingestion/query
// interface (see db/index.ts once it lands) is the only intended surface.
import { openDatabaseSync } from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import * as schema from "./schema";

const DB_NAME = "zeeya.db";

export const sqlite = openDatabaseSync(DB_NAME, { enableChangeListener: true });
export const db = drizzle(sqlite, { schema });

export type Database = typeof db;
