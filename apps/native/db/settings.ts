import { eq } from "drizzle-orm";

import { db } from "./client";
import type { Database } from "./client.native";
import { localSettings } from "./schema";

const SETTINGS_ID = "default";

export interface LocalSettings {
  backgroundSyncEnabled: boolean;
  transactionNotificationsEnabled: boolean;
  biometricLockEnabled: boolean;
  screenCaptureProtectionEnabled: boolean;
}

export type LocalSettingsPatch = Partial<LocalSettings>;

export const DEFAULT_LOCAL_SETTINGS: Readonly<LocalSettings> = {
  backgroundSyncEnabled: false,
  transactionNotificationsEnabled: false,
  biometricLockEnabled: false,
  screenCaptureProtectionEnabled: false,
};

function requireDb(): Database {
  if (!db) {
    throw new Error("Local settings are unavailable on this platform.");
  }
  return db;
}

function toLocalSettings(row: typeof localSettings.$inferSelect): LocalSettings {
  return {
    backgroundSyncEnabled: row.backgroundSyncEnabled,
    transactionNotificationsEnabled: row.transactionNotificationsEnabled,
    biometricLockEnabled: row.biometricLockEnabled,
    screenCaptureProtectionEnabled: row.screenCaptureProtectionEnabled,
  };
}

export async function getLocalSettings(): Promise<LocalSettings> {
  const row = requireDb()
    .select()
    .from(localSettings)
    .where(eq(localSettings.id, SETTINGS_ID))
    .get();

  return row ? toLocalSettings(row) : { ...DEFAULT_LOCAL_SETTINGS };
}

export async function updateLocalSettings(patch: LocalSettingsPatch): Promise<LocalSettings> {
  const database = requireDb();
  const current = await getLocalSettings();
  const next = { ...current, ...patch };

  database
    .insert(localSettings)
    .values({ id: SETTINGS_ID, ...next, updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: localSettings.id,
      set: { ...next, updatedAt: Date.now() },
    })
    .run();

  return next;
}
