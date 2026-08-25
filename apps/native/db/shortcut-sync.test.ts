import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { initializeNativeDatabase } from "./native-init";
import * as schema from "./schema";
import type { ShortcutMessageQueue } from "./shortcut-sync";

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

function freshDb() {
  const sqlite = new Database(":memory:");
  initializeNativeDatabase({ execSync: (source: string) => sqlite.exec(source) });
  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((candidate) => candidate.endsWith(".sql"))
    .sort()) {
    for (const statement of readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8").split(
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

const { drainShortcutInbox } = await import("./shortcut-sync");
const { getSyncStatus } = await import("./ingestion");

const BODY =
  "Dear UPI user A/C X8124 debited by 50.00 on date 21Aug26 trf to RAJPUROHIT NAREN Refno 258565338181 If not u? call-1800111109 for other services-18001234-SBI";

function envelope(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    version: 1,
    id: "D742B5C2-7B80-4D01-95FA-1A36BFA6B483",
    sender: "+916304890311",
    body: BODY,
    receivedAt: 1_787_290_200_000,
    capturedAt: 1_787_290_205_000,
    ...overrides,
  });
}

function queue(entries: Array<{ fileName: string; contents: string }>): {
  adapter: ShortcutMessageQueue;
  acknowledged: string[];
  quarantined: string[];
} {
  const acknowledged: string[] = [];
  const quarantined: string[] = [];
  return {
    acknowledged,
    quarantined,
    adapter: {
      listPending: async () => entries,
      acknowledge: async (fileName) => {
        acknowledged.push(fileName);
      },
      quarantine: async (fileName) => {
        quarantined.push(fileName);
      },
    },
  };
}

describe("drainShortcutInbox", () => {
  beforeEach(() => {
    testDb = freshDb();
  });

  it("feeds an iOS Shortcut message through the shared ledger without advancing Android's checkpoint", async () => {
    const pending = queue([{ fileName: "one.json", contents: envelope() }]);

    const result = await drainShortcutInbox(pending.adapter);

    expect(result.dashboard.recent).toHaveLength(1);
    expect(result.dashboard.recent[0]).toMatchObject({
      sender: "+916304890311",
      body: BODY,
      date: 1_787_290_200_000,
    });
    expect(result.accepted).toBe(1);
    expect(result.rejected).toEqual([]);
    expect(pending.acknowledged).toEqual(["one.json"]);
    await expect(getSyncStatus()).resolves.toEqual({
      lastIngestedDate: null,
      lastIngestedProviderId: null,
    });
  });

  it("acknowledges duplicate deliveries after the idempotent ledger accepts the retry", async () => {
    const first = queue([{ fileName: "first.json", contents: envelope() }]);
    const retry = queue([{ fileName: "retry.json", contents: envelope() }]);

    await drainShortcutInbox(first.adapter);
    const result = await drainShortcutInbox(retry.adapter);

    expect(result.dashboard.recent).toHaveLength(1);
    expect(retry.acknowledged).toEqual(["retry.json"]);
  });

  it("isolates malformed entries while still ingesting and acknowledging valid entries", async () => {
    const pending = queue([
      { fileName: "bad.json", contents: "{not-json" },
      { fileName: "future.json", contents: envelope({ version: 2 }) },
      { fileName: "good.json", contents: envelope({ id: "good" }) },
    ]);

    const result = await drainShortcutInbox(pending.adapter);

    expect(result.dashboard.recent).toHaveLength(1);
    expect(result.accepted).toBe(1);
    expect(result.rejected).toEqual([
      { fileName: "bad.json", reason: "Shortcut message is not valid JSON." },
      {
        fileName: "future.json",
        reason: "Shortcut message has an unsupported or malformed envelope.",
      },
    ]);
    expect(pending.acknowledged).toEqual(["good.json"]);
    expect(pending.quarantined).toEqual(["bad.json", "future.json"]);
  });

  it("does not acknowledge any valid entry when ledger ingestion fails", async () => {
    const pending = queue([
      { fileName: "bad.json", contents: "{not-json" },
      { fileName: "one.json", contents: envelope() },
    ]);
    testDb = undefined as unknown as ReturnType<typeof freshDb>;

    await expect(drainShortcutInbox(pending.adapter)).rejects.toThrow();
    expect(pending.acknowledged).toEqual([]);
    expect(pending.quarantined).toEqual(["bad.json"]);
  });
});
