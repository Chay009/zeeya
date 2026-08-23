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

// Faithfully mimics react-native-get-sms-android's own since/until/order/
// indexFrom/maxCount semantics (see lib/sms.ts and its Java source):
// filter first, sort by the requested order, then take a real position-
// based [indexFrom, indexFrom + maxCount) slice of the *filtered* set.
function fakeInboxReader(all: readonly RawSms[]): InboxReader {
  return async ({ since, until, order, indexFrom = 0, maxCount }) => {
    const matching = all.filter(
      (m) => (since === undefined || m.date >= since) && (until === undefined || m.date <= until),
    );
    matching.sort((a, b) => (order === "oldest-first" ? a.date - b.date : b.date - a.date));
    return maxCount === undefined
      ? matching.slice(indexFrom)
      : matching.slice(indexFrom, indexFrom + maxCount);
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
    const reader = fakeInboxReader([...inRange, outOfRange]);

    const result = await backfillSms({ from: T, to: T + 2 * TEN_MINUTES }, reader);

    expect(result.insertedCount).toBe(3);
    expect(result.dashboard.activity.map((m) => m.id).sort()).toEqual(
      inRange.map(fingerprintOf).sort(),
    );
  });

  it("paginates across a range wider than one reader page without skipping anything", async () => {
    const messages = Array.from({ length: 9 }, (_, i) =>
      rawSms({ id: `m${i}`, date: T + i * TEN_MINUTES }),
    );
    const reader = fakeInboxReader(messages);

    const result = await backfillSms(
      { from: T, to: messages[messages.length - 1]!.date },
      reader,
      { pageSize: 2 }, // page smaller than the 9-message range
    );

    expect(result.insertedCount).toBe(9);
    expect(result.dashboard.activity.map((m) => m.id).sort()).toEqual(
      messages.map(fingerprintOf).sort(),
    );
  });

  it("paginates a range densely packed within the old overlap window (1 second apart) without skipping anything", async () => {
    // The exact bug an earlier review caught: pagination that moved the
    // time boundary itself between pages could re-return the same page
    // (and then stop, believing there was no more progress to make)
    // whenever messages were packed more tightly than its overlap window.
    // Position-based (indexFrom) pagination has no such failure mode,
    // however densely the messages are packed.
    const ONE_SECOND = 1_000;
    const messages = Array.from({ length: 11 }, (_, i) =>
      rawSms({ id: `m${i}`, date: T + i * ONE_SECOND }),
    );
    const reader = fakeInboxReader(messages);

    const result = await backfillSms({ from: T, to: messages[messages.length - 1]!.date }, reader, {
      pageSize: 3,
    });

    expect(result.insertedCount).toBe(11);
    expect(result.dashboard.activity.map((m) => m.id).sort()).toEqual(
      messages.map(fingerprintOf).sort(),
    );
  });

  it("paginates a burst of messages sharing the exact same timestamp without skipping anything", async () => {
    // A later review round caught this test's own gap: every fixture had
    // identical sender/date/body, so they all shared ONE fingerprint —
    // the assertion (exactly one ledger row) would have passed even if
    // pagination were completely broken and only read the first page,
    // since a single page already contains every distinct fingerprint
    // there is (one). Distinct bodies make these genuinely 20 different
    // fingerprints sharing one timestamp, which is what actually exercises
    // same-timestamp page-boundary behavior — the sharpest version of the
    // pagination bug this guards: with a shared timestamp, ANY backward
    // time shift still matches `since <= that timestamp`, so the old
    // time-boundary approach re-matched the identical set forever. Only
    // position-based pagination, with a deterministic tiebreak on ties
    // (see lib/sms.ts's `_id` secondary sort key), can make progress here.
    const burst = Array.from({ length: 20 }, (_, i) =>
      rawSms({ id: `b${i}`, date: T, body: `${HDFC_DEBIT} (variant ${i})` }),
    );
    const reader = fakeInboxReader(burst);

    const result = await backfillSms({ from: T, to: T }, reader, { pageSize: 3 });

    expect(result.insertedCount).toBe(20);
    const rows = testDb.select().from(schema.smsLedger).all();
    expect(rows.map((r) => r.id).sort()).toEqual(burst.map(fingerprintOf).sort());
  });

  it("never advances the automatic-sync checkpoint when the backfilled range is entirely older history", async () => {
    const recent = rawSms({ id: "recent", date: T + 1000 * TEN_MINUTES });
    await syncInbox(async () => [recent]);
    const before = await getSyncStatus();
    expect(before.lastIngestedDate).toBe(recent.date);

    const historical = [
      rawSms({ id: "old1", date: T }),
      rawSms({ id: "old2", date: T + TEN_MINUTES }),
    ];
    const reader = fakeInboxReader(historical);
    await backfillSms({ from: T, to: T + TEN_MINUTES }, reader);

    const after = await getSyncStatus();
    expect(after.lastIngestedDate).toBe(recent.date);

    const rows = testDb.select().from(schema.smsLedger).all();
    expect(rows.map((r) => r.id).sort()).toEqual([recent, ...historical].map(fingerprintOf).sort());
  });

  it("never advances the automatic-sync checkpoint even when the backfilled range includes dates newer than the current checkpoint", async () => {
    // The gap in an earlier version's own test: it only proved backfill
    // was harmless for a range entirely OLDER than the checkpoint, which
    // ingestSmsBatch's ordinary "only if newer" upsert already guarantees
    // on its own — it didn't prove the { advanceCheckpoint: false } option
    // itself does anything. This range spans both older AND newer-than-
    // checkpoint dates, so without that option this would legitimately
    // move the checkpoint forward.
    const oldSeed = rawSms({ id: "seed", date: T });
    await syncInbox(async () => [oldSeed]);
    const before = await getSyncStatus();
    expect(before.lastIngestedDate).toBe(T);

    const newerThanCheckpoint = rawSms({
      id: "newer",
      date: T + 5 * TEN_MINUTES,
      body: "distinct content from the seed",
    });
    const reader = fakeInboxReader([newerThanCheckpoint]);
    await backfillSms({ from: T, to: T + 10 * TEN_MINUTES }, reader);

    const after = await getSyncStatus();
    expect(after.lastIngestedDate).toBe(T); // unchanged, despite ingesting a newer-dated message

    const rows = testDb.select().from(schema.smsLedger).all();
    expect(rows.map((r) => r.id).sort()).toEqual(
      [oldSeed, newerThanCheckpoint].map(fingerprintOf).sort(),
    );
  });
});
