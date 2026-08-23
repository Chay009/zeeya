// Runs against a real SQLite database (better-sqlite3), same approach as
// sync.test.ts — the inbox reader is a plain in-memory fake (see
// InboxReader's own comment in sync.ts), which is what makes this
// testable at all despite the real reader living behind react-native.
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

vi.mock("./client", () => ({
  get db() {
    return testDb;
  },
}));

const { backfillSms } = await import("./backfill");
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

// Mimics react-native-get-sms-android's own since/until/order/truncation
// behavior (see lib/sms.ts) entirely in memory, with a fixed page size.
function fakeInboxReader(all: readonly RawSms[], pageSize: number): InboxReader {
  return async ({ since, until, order }) => {
    const matching = all.filter(
      (m) => (since === undefined || m.date >= since) && (until === undefined || m.date <= until),
    );
    matching.sort((a, b) => (order === "oldest-first" ? a.date - b.date : b.date - a.date));
    return matching.slice(0, pageSize);
  };
}

describe("backfillSms", () => {
  beforeEach(() => {
    testDb = freshDb();
  });

  it("ingests every message within the range in a single page", async () => {
    const inRange = [
      rawSms({ id: "m1", date: T }),
      rawSms({ id: "m2", date: T + TEN_MINUTES }),
      rawSms({ id: "m3", date: T + 2 * TEN_MINUTES }),
    ];
    const outOfRange = rawSms({ id: "m4", date: T + 100 * TEN_MINUTES });
    const reader = fakeInboxReader([...inRange, outOfRange], 100);

    const dashboard = await backfillSms({ from: T, to: T + 2 * TEN_MINUTES }, reader);

    expect(dashboard.activity.map((m) => m.id).sort()).toEqual(inRange.map(fingerprintOf).sort());
  });

  it("paginates across a range wider than one reader page without skipping anything", async () => {
    // The exact backlog-vs-page-size shape sync.test.ts's gap regression
    // guards, applied to an explicit bounded range instead of an open-
    // ended catch-up: a naive single read, capped at a page size smaller
    // than the range's actual message count, would silently leave out
    // whatever didn't fit. Repeated oldest-first, overlapping pages must
    // cover the whole range regardless.
    const messages = Array.from({ length: 9 }, (_, i) =>
      rawSms({ id: `m${i}`, date: T + i * TEN_MINUTES }),
    );
    const reader = fakeInboxReader(messages, 2); // page smaller than the 9-message range

    const dashboard = await backfillSms(
      { from: T, to: messages[messages.length - 1]!.date },
      reader,
    );

    expect(dashboard.activity.map((m) => m.id).sort()).toEqual(messages.map(fingerprintOf).sort());
  });

  it("never advances the automatic-sync checkpoint when the backfilled range is entirely older history", async () => {
    // A backfill's job is to fill in the past, not to move the "what
    // counts as already synced going forward" boundary — the two features
    // (db/sync.ts's syncInbox and this) must not interfere with each
    // other. ingestSmsBatch's own "only if newer" checkpoint upsert
    // already guarantees this; this test proves it holds through
    // backfillSms's own call pattern too.
    const recent = rawSms({ id: "recent", date: T + 1000 * TEN_MINUTES });
    await syncInbox(async () => [recent]);
    const before = await getSyncStatus();
    expect(before.lastIngestedDate).toBe(recent.date);

    const historical = [
      rawSms({ id: "old1", date: T }),
      rawSms({ id: "old2", date: T + TEN_MINUTES }),
    ];
    const reader = fakeInboxReader(historical, 100);
    await backfillSms({ from: T, to: T + TEN_MINUTES }, reader);

    const after = await getSyncStatus();
    expect(after.lastIngestedDate).toBe(recent.date);

    const rows = testDb.select().from(schema.smsLedger).all();
    expect(rows.map((r) => r.id).sort()).toEqual([recent, ...historical].map(fingerprintOf).sort());
  });
});
