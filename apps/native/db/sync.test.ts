// Runs against a real SQLite database (better-sqlite3), same approach as
// ingestion.test.ts — proves syncInbox()'s checkpoint/order/pagination
// behavior against real transactional state, not a mock that might not
// reproduce it. The inbox reader itself is a plain in-memory fake (see
// InboxReader's own comment in sync.ts): syncInbox is deliberately
// decoupled from any native module, which is what makes it testable at
// all — app/(drawer)/index.tsx, and lib/sms.ts's real readSmsInbox, both
// transitively import react-native, which fails to even parse under
// Vitest (Flow syntax in react-native's own entry file) — confirmed
// directly, not assumed.
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
const { backfillSms } = await import("./backfill");
const { getSyncStatus } = await import("./ingestion");

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

// Faithfully mimics react-native-get-sms-android's own since/until/order/
// indexFrom/maxCount semantics (see lib/sms.ts and its Java source):
// filter first, sort by the requested order, then take a real position-
// based [indexFrom, indexFrom + maxCount) slice of the *filtered* set —
// not a fixed page size applied independently of what the caller asked
// for. This is what makes the multi-page tests below actually exercise
// inbox-pagination.ts's real drainInbox() logic, not a stand-in for it.
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

    expect(seenArgs).toEqual({ order: "newest-first" });
    expect(dashboard.activity).toHaveLength(2);
  });

  it("reads oldest-first from checkpoint-minus-overlap, paginated, once a checkpoint exists", async () => {
    await syncInbox(async () => [rawSms({ id: "seed", date: T })]);

    const calls: Parameters<InboxReader>[0][] = [];
    const reader: InboxReader = async (args) => {
      calls.push(args);
      return [];
    };
    await syncInbox(reader);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      since: T - 60_000,
      order: "oldest-first",
      indexFrom: 0,
      maxCount: expect.any(Number),
    });
  });

  it("catches up across every page within a single syncInbox() call, even with a page-sized backlog", async () => {
    // The gap this guards is the same one the old backfillSms bug had: a
    // naive newest-first-only or single-page read would silently drop
    // whatever didn't fit. This proves syncInbox() itself now fully
    // drains the backlog in one call (the previous version only read one
    // page per call and relied on the caller invoking it repeatedly).
    const seed = rawSms({ id: "m1", date: T });
    const backlog = Array.from({ length: 7 }, (_, i) =>
      rawSms({ id: `bl${i}`, date: T + (i + 1) * TEN_MINUTES }),
    );
    const reader = fakeInboxReader([seed, ...backlog]);

    await syncInbox(async () => [seed]); // establish the checkpoint
    const dashboard = await syncInbox(reader, { pageSize: 2 }); // page smaller than the 7-message backlog

    expect(dashboard.activity).toHaveLength(8);
    const status = await getSyncStatus();
    expect(status.lastIngestedDate).toBe(backlog[backlog.length - 1]!.date);
  });

  it("catches up across every page when the backlog is densely packed (1 second apart, well inside the 60s overlap window)", async () => {
    // The exact bug Codex's review caught: the previous time-boundary-
    // based pagination moved `since` to `pageMax - 60s` between pages,
    // which could re-return the *same* page when messages were packed
    // more tightly than that 60s window — the loop then saw "no forward
    // progress" and stopped, silently dropping everything after. Position-
    // based (indexFrom) pagination has no such failure mode.
    const seed = rawSms({ id: "m1", date: T });
    const ONE_SECOND = 1_000;
    const backlog = Array.from({ length: 9 }, (_, i) =>
      rawSms({ id: `bl${i}`, date: T + (i + 1) * ONE_SECOND }),
    );
    const reader = fakeInboxReader([seed, ...backlog]);

    await syncInbox(async () => [seed]);
    const dashboard = await syncInbox(reader, { pageSize: 3 });

    expect(dashboard.activity).toHaveLength(10);
    const status = await getSyncStatus();
    expect(status.lastIngestedDate).toBe(backlog[backlog.length - 1]!.date);
  });

  it("catches up across every page when many messages share the exact same timestamp", async () => {
    // The sharpest version of the same bug: with a shared timestamp, ANY
    // backward time shift still satisfies `since <= that timestamp`, so a
    // time-boundary approach re-matches the identical set forever,
    // regardless of overlap size. Only position-based pagination can make
    // progress here at all.
    //
    // Distinct bodies (not just distinct ids) so these 8 burst messages
    // are genuinely 8 different fingerprints sharing one timestamp — the
    // pagination question this test is about — rather than 8 duplicates of
    // one message, which would collapse to a single ledger row regardless
    // of how the pagination itself behaved.
    const seed = rawSms({ id: "m1", date: T });
    const burst = Array.from({ length: 8 }, (_, i) =>
      rawSms({ id: `burst${i}`, date: T + 1, body: `${HDFC_DEBIT} (variant ${i})` }),
    );
    const reader = fakeInboxReader([seed, ...burst]);

    await syncInbox(async () => [seed]);
    await syncInbox(reader, { pageSize: 3 });

    // Checked against the ledger directly rather than dashboard.activity:
    // the synthetic "(variant N)" suffix on each burst message's body
    // isn't guaranteed to still parse as a recognized bank transaction,
    // and this test is about whether every message reached the ledger at
    // all, not about Malana's parsing of these particular bodies.
    const rows = testDb.select().from(schema.smsLedger).all();
    expect(rows).toHaveLength(9);
  });

  it("coalesces concurrent syncInbox() calls into one real sync, not one queued sync per caller", async () => {
    // Distinct from the mutex test below: mutual exclusion alone (never
    // running two syncs at the same instant) would still let three
    // concurrent callers each trigger a full, genuinely separate sync,
    // one after another — correct, but 3x the real device-inbox reads and
    // parses for calls that all just wanted "caught up." True single-
    // flight coalescing means only the first call's execution is real;
    // the other two reuse its in-flight result instead of running the
    // reader again themselves.
    let callCount = 0;
    const reader: InboxReader = async () => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return [];
    };

    await Promise.all([syncInbox(reader), syncInbox(reader), syncInbox(reader)]);

    // A first-ever sync makes exactly one reader call (the no-checkpoint
    // branch isn't paginated) — three genuinely separate executions would
    // have made three.
    expect(callCount).toBe(1);
  });

  it("triggers a genuinely new sync for a call that arrives after the previous one has already finished", async () => {
    let callCount = 0;
    const reader: InboxReader = async () => {
      callCount++;
      return [];
    };

    await syncInbox(reader);
    await syncInbox(reader);

    expect(callCount).toBe(2); // not coalesced — these never overlapped
  });

  it("never runs concurrently with another syncInbox()/backfillSms() call", async () => {
    let active = 0;
    let sawOverlap = false;
    const trackingReader: InboxReader = async () => {
      active++;
      if (active > 1) sawOverlap = true;
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return [];
    };

    await Promise.all([
      syncInbox(trackingReader),
      backfillSms({ from: T, to: T + TEN_MINUTES }, trackingReader),
      syncInbox(trackingReader),
    ]);

    expect(sawOverlap).toBe(false);
  });

  it("rejects a non-positive pageSize instead of looping forever", async () => {
    // pageSize: 0 breaks drainInbox's two termination conditions at once
    // (see inbox-pagination.ts's own comment): the real native reader
    // ignores a non-positive maxCount and returns everything unbounded, so
    // `page.length < pageSize` can never be true, and indexFrom never
    // advances either — an infinite loop with no useful error. Establish a
    // checkpoint first so this actually reaches drainInbox (the no-
    // checkpoint branch doesn't paginate at all).
    await syncInbox(async () => [rawSms({ id: "seed", date: T })]);

    await expect(syncInbox(async () => [], { pageSize: 0 })).rejects.toThrow(/positive integer/);
  });

  it("rejects a non-positive pageSize on a first-ever sync too, not just once a checkpoint exists", async () => {
    // A previous version validated pageSize only inside drainInbox, which
    // the no-checkpoint branch never calls (it reads one unpaginated
    // page) — so an invalid pageSize on a first-ever sync was silently
    // ignored instead of rejected, unlike the already-covered checkpoint
    // case above.
    await expect(syncInbox(async () => [], { pageSize: 0 })).rejects.toThrow(/positive integer/);
  });
});
