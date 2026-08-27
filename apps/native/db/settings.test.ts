import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { initializeNativeDatabase } from "./native-init";
import * as schema from "./schema";

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

function freshDb() {
  const sqlite = new Database(":memory:");
  initializeNativeDatabase({ execSync: (source: string) => sqlite.exec(source) });

  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    for (const statement of readFileSync(path.join(MIGRATIONS_DIR, file), "utf8").split(
      "--> statement-breakpoint",
    )) {
      if (statement.trim()) sqlite.exec(statement);
    }
  }

  return drizzle(sqlite, { schema });
}

let testDb: ReturnType<typeof freshDb>;

vi.mock("./client", () => ({
  get db() {
    return testDb;
  },
}));

const { getLocalSettings, updateLocalSettings } = await import("./settings");

describe("local capability settings", () => {
  beforeEach(() => {
    testDb = freshDb();
  });

  it("returns privacy-safe, backwards-compatible defaults before a row exists", async () => {
    await expect(getLocalSettings()).resolves.toEqual({
      backgroundSyncEnabled: false,
      transactionNotificationsEnabled: false,
      biometricLockEnabled: false,
      screenCaptureProtectionEnabled: false,
    });
  });

  it("persists a partial update without resetting unrelated preferences", async () => {
    await updateLocalSettings({ backgroundSyncEnabled: true, biometricLockEnabled: true });
    await updateLocalSettings({ transactionNotificationsEnabled: true });

    await expect(getLocalSettings()).resolves.toEqual({
      backgroundSyncEnabled: true,
      transactionNotificationsEnabled: true,
      biometricLockEnabled: true,
      screenCaptureProtectionEnabled: false,
    });
  });

  it("can turn an enabled preference back off", async () => {
    await updateLocalSettings({ screenCaptureProtectionEnabled: true });
    await updateLocalSettings({ screenCaptureProtectionEnabled: false });

    expect((await getLocalSettings()).screenCaptureProtectionEnabled).toBe(false);
  });
});
