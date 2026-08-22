// Runs against a real SQLite database (better-sqlite3), same approach as
// ingestion.test.ts — proves syncInbox()'s checkpoint/order behavior
// against real transactional state, not a mock that might not reproduce
// it. The inbox reader itself is a plain in-memory fake (see InboxReader's
// own comment in sync.ts): syncInbox is deliberately decoupled from any
// native module, which is what makes it testable at all — app/(drawer)/
// index.tsx, and lib/sms.ts's real readSmsInbox, both transitively import
// react-native, which fails to even parse under Vitest (Flow syntax in
// react-native's own entry file) — confirmed directly, not assumed.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "./schema";
import { initializeNativeDatabase } from "./native-init";
import type { RawSms } from "../lib/sms";
import type { InboxReader } from "./sync";

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

function freshDb() {
  const sqlite = new Database(":memory:");
  initializeNativeDatabase({ execSync: (source: string) => sqlite.exec(source) });
  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of migrationFiles) {
    const statements = readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8").split(
      "--> statement-breakpoint",
    );
    for (const statement of statements) {
      const trimmed = statement.trim();
      if (trimmed) sqlite.exec(trimmed);
    }
  }
  return drizzle(sqlite, { schema });
}

let testDb: ReturnType<typeof freshDb>;

// db/client.native.ts opens a real expo-sqlite connection at module load,
// which doesn't exist in this Node test environment — mock the whole
// module so ingestion.ts's `import { db } from "./client"` (transitively,
// via sync.ts) resolves to this test's in-memory better-sqlite3 instance.
vi.mock("./client", () => ({
  get db() {
    return testDb;
  },
}));

const { syncInbox } = await import("./sync");
const { getSyncStatus, computeFingerprint } = await import("./ingestion");

const T = 1_700_000_000_000;
const TEN_MINUTES = 600_000;
const HDFC_DEBIT =
  "INR 5,000.00 debited from account XX1234 on 09-08-2026. Avail Bal: INR 12,500.00";

function rawSms(overrides: Partial<RawSms> & { id: string; date: number }): RawSms {
  return {
    sender: "VM-HDFCBK",
    body: HDFC_DEBIT,
    ...overrides,
  };
}

function fingerprintOf(m: RawSms): string {
  return computeFingerprint(m.sender, m.date, m.body);
}

// Mimics react-native-get-sms-android's own since/order/truncation
// behavior (see lib/sms.ts) entirely in memory, with a fixed page size —
// `all` stands in for the device's full SMS inbox, unaffected by what's
// already been ingested, exactly like the real content provider.
function fakeInboxReader(all: readonly RawSms[], pageSize: number): InboxReader {
  return async ({ since, order }) => {
    const matching = since === undefined ? [...all] : all.filter((m) => m.date >= since);
    matching.sort((a, b) => (order === "oldest-first" ? a.date - b.date : b.date - a.date));
    return matching.slice(0, pageSize);
  };
}

describe("syncInbox", () => {
  beforeEach(() => {
    testDb = freshDb();
  });

  it("reads the whole inbox newest-first on a first-ever sync (no checkpoint yet)", async () => {
    const messages = [rawSms({ id: "m1", date: T }), rawSms({ id: "m2", date: T + TEN_MINUTES })];
    let seenArgs: Parameters<InboxReader>[0] | undefined;
    const reader: InboxReader = async (args) => {
      seenArgs = args;
      return messages;
    };

    const dashboard = await syncInbox(reader);

    expect(seenArgs).toEqual({ since: undefined, order: "newest-first" });
    expect(dashboard.activity.map((m) => m.id).sort()).toEqual(messages.map(fingerprintOf).sort());
  });

  it("reads oldest-first from checkpoint-minus-overlap once a checkpoint exists", async () => {
    await syncInbox(async () => [rawSms({ id: "seed", date: T })]);

    let seenArgs: Parameters<InboxReader>[0] | undefined;
    const reader: InboxReader = async (args) => {
      seenArgs = args;
      return [];
    };
    await syncInbox(reader);

    expect(seenArgs).toEqual({ since: T - 60_000, order: "oldest-first" });
  });

  it("eventually ingests every backlogged message across repeated calls, even when each call's reader page is smaller than the backlog", async () => {
    // The gap this guards: a naive newest-first read, bounded by a page
    // size smaller than the actual backlog, returns the truly newest
    // messages and advances the checkpoint to their date — silently and
    // PERMANENTLY skipping every older-but-still-unsynced message that
    // didn't fit in that page, since the next sync's checkpoint has
    // already moved past them. Oldest-first instead makes every call a
    // bounded, gapless step forward: nothing is skipped, it just takes
    // more calls to fully catch up.
    const seed = rawSms({ id: "m1", date: T });
    const backlog = [
      rawSms({ id: "m2", date: T + TEN_MINUTES }),
      rawSms({ id: "m3", date: T + 2 * TEN_MINUTES }),
      rawSms({ id: "m4", date: T + 3 * TEN_MINUTES }),
      rawSms({ id: "m5", date: T + 4 * TEN_MINUTES }),
    ];
    const allOnDevice = [seed, ...backlog];

    // Establishes the checkpoint at m1's date (first-ever sync).
    await syncInbox(async () => [seed]);

    const reader = fakeInboxReader(allOnDevice, 2); // page smaller than the 4-message backlog
    for (let i = 0; i < 10; i++) {
      await syncInbox(reader);
    }

    const status = await getSyncStatus();
    expect(status.lastIngestedDate).toBe(backlog[backlog.length - 1]!.date);

    const rows = testDb.select().from(schema.smsLedger).all();
    expect(rows.map((r) => r.id).sort()).toEqual(allOnDevice.map(fingerprintOf).sort());
  });
});
