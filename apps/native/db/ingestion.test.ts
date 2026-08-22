// Runs against a real SQLite database (better-sqlite3, same approach as
// schema.smoke.test.ts) rather than mocking drizzle — the whole point of
// this suite is proving ingestSmsBatch's idempotency, no-reparse, and
// atomicity guarantees hold against real transaction/constraint behavior,
// not against a mock that might not reproduce it.
//
// Static imports throughout, deliberately: ingestion.ts imports MalanaEngine
// itself, so spying on MalanaEngine.prototype.parse only works if the test
// file's own MalanaEngine reference resolves to the exact same class object
// ingestion.ts uses. A dynamic per-test `await import("./ingestion")`
// combined with `vi.resetModules()` breaks that — each fresh import gets
// its own separate module registry snapshot, so the spy silently attaches
// to a different (unused) MalanaEngine class than the one ingestion.ts
// actually calls, and every parse-count assertion reads 0 regardless of
// what really happened. Nothing here needs cross-test module isolation
// anyway (engine.parse() is stateless per call), so plain static imports
// are both the fix and the simpler design.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { MalanaEngine } from "@zeeya/parser/malana";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "./schema";
import { initializeNativeDatabase } from "./native-init";
import type { RawSms } from "../lib/sms";

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
// module so ingestion.ts's `import { db } from "./client"` resolves to
// this test's in-memory better-sqlite3 instance instead.
vi.mock("./client", () => ({
  get db() {
    return testDb;
  },
}));

const { ingestSmsBatch, getSyncStatus, loadDashboard, loadTransactions } =
  await import("./ingestion");

const HDFC_DEBIT =
  "INR 5,000.00 debited from account XX1234 on 09-08-2026. Avail Bal: INR 12,500.00";
const SBI_UPI =
  "Dear UPI user A/C X1434 debited by 999.00 on date 15Jul26 trf to ZERODHA BROKING Refno 046545973198 If not u? call-1800111109 for other services-18001234-SBI";

function rawSms(overrides: Partial<RawSms> & { id: string }): RawSms {
  return {
    sender: "VM-HDFCBK",
    body: HDFC_DEBIT,
    date: 1700000000000,
    ...overrides,
  };
}

describe("ingestSmsBatch", () => {
  let parseSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    testDb = freshDb();
    parseSpy = vi.spyOn(MalanaEngine.prototype, "parse");
  });

  afterEach(() => {
    parseSpy.mockRestore();
  });

  it("persists a real message into the ledger with a parsed result", async () => {
    await ingestSmsBatch([rawSms({ id: "1" })]);

    const rows = testDb.select().from(schema.smsLedger).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ingestionStatus).toBe("parsed");
    expect(rows[0]!.parsedResult).not.toBeNull();
    expect(JSON.parse(rows[0]!.parsedResult!).trx).toBe("5000.00");
  });

  it("is idempotent AND does not re-parse already-ingested messages", async () => {
    const message = rawSms({ id: "1" });

    await ingestSmsBatch([message]);
    expect(parseSpy).toHaveBeenCalledTimes(1);

    // The false claim this test replaces: engine.parse() was previously
    // called for every message before any DB check ran, so re-ingesting
    // 5,000 already-known messages meant 5,000 unnecessary parses. Existence
    // is now checked in bulk before parsing anything.
    await ingestSmsBatch([message]);
    await ingestSmsBatch([message]);

    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(testDb.select().from(schema.smsLedger).all()).toHaveLength(1);
  });

  it("does not duplicate or re-parse under a fingerprint collision with a different provider id", async () => {
    const message = rawSms({ id: "1" });
    await ingestSmsBatch([message]);
    expect(parseSpy).toHaveBeenCalledTimes(1);

    // Same sender/date/body (same fingerprint) but a different provider id —
    // the exact cross-scheme collision schema.ts's fingerprint column
    // exists to catch.
    await ingestSmsBatch([{ ...message, id: "different-provider-id" }]);

    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(testDb.select().from(schema.smsLedger).all()).toHaveLength(1);
  });

  it("enriches a fingerprint-only row with a provider id that becomes available later, without re-parsing", async () => {
    // Empty id — RawSms.id is typed as required, but "no provider id
    // available yet" is exactly the scenario issue #17 names. The row is
    // keyed by fingerprint alone.
    const withoutProviderId = rawSms({ id: "" });
    await ingestSmsBatch([withoutProviderId]);

    const afterFirst = testDb.select().from(schema.smsLedger).all();
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]!.providerId).toBeNull();
    const fingerprintRowId = afterFirst[0]!.id;

    // Same content, now with a real provider id.
    await ingestSmsBatch([{ ...withoutProviderId, id: "provider-123" }]);

    expect(parseSpy).toHaveBeenCalledTimes(1);
    const afterSecond = testDb.select().from(schema.smsLedger).all();
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0]!.id).toBe(fingerprintRowId);
    expect(afterSecond[0]!.providerId).toBe("provider-123");
  });

  it("processes a batch of distinct real messages independently", async () => {
    await ingestSmsBatch([
      rawSms({ id: "1", body: HDFC_DEBIT, sender: "VM-HDFCBK" }),
      rawSms({ id: "2", body: SBI_UPI, sender: "VM-SBIINB", date: 1700000001000 }),
    ]);

    const rows = testDb.select().from(schema.smsLedger).all();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.ingestionStatus === "parsed")).toBe(true);
    expect(parseSpy).toHaveBeenCalledTimes(2);
  });

  it("parses an in-batch duplicate only once, not once per copy", async () => {
    // Two entries with identical sender/date/body (same fingerprint) inside
    // one call, neither yet in the DB — the second must be recognized as a
    // duplicate of the first via the in-loop map, not parsed again only to
    // have its insert silently no-op against the first one's row.
    const message = rawSms({ id: "1" });
    await ingestSmsBatch([message, { ...message, id: "2" }]);

    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(testDb.select().from(schema.smsLedger).all()).toHaveLength(1);
  });

  it("handles a batch large enough to span multiple existence-check chunks, including on re-ingestion", async () => {
    // Real-world trigger: a phone that's been offline for a while can
    // realistically accumulate several hundred new messages before the
    // next refresh. 1,500 exceeds EXISTENCE_CHECK_CHUNK_SIZE (400) several
    // times over, so this exercises the actual chunk boundary, not just a
    // single query.
    const large = Array.from({ length: 1500 }, (_, i) =>
      rawSms({ id: `bulk-${i}`, date: 1700000000000 + i }),
    );

    await ingestSmsBatch(large);
    expect(testDb.select().from(schema.smsLedger).all()).toHaveLength(1500);
    expect(parseSpy).toHaveBeenCalledTimes(1500);

    // Re-ingesting the same 1,500 must find every one of them across
    // however many existence-check chunks they fall into — not just the
    // ones that happen to share a chunk with themselves.
    await ingestSmsBatch(large);
    expect(testDb.select().from(schema.smsLedger).all()).toHaveLength(1500);
    expect(parseSpy).toHaveBeenCalledTimes(1500);
  });

  it("isolates a parse failure to that one message instead of aborting the whole batch", async () => {
    // engine.parse(null, ...) genuinely throws (verified directly) — a
    // realistic defensive case, not a contrived one: lib/sms.ts's own
    // comment notes OS/OEM-defined quirks in what the SMS content provider
    // actually returns, and RawSms.body being null despite its string type
    // is exactly the kind of quirk that comment is about.
    await ingestSmsBatch([
      rawSms({ id: "good", body: HDFC_DEBIT }),
      rawSms({ id: "bad", body: null as unknown as string }),
    ]);

    const rows = testDb.select().from(schema.smsLedger).all();
    expect(rows).toHaveLength(2);

    const good = rows.find((r) => r.id === "good")!;
    expect(good.ingestionStatus).toBe("parsed");
    expect(good.parsedResult).not.toBeNull();

    const bad = rows.find((r) => r.id === "bad")!;
    expect(bad.ingestionStatus).toBe("error");
    expect(bad.parsedResult).toBeNull();
    expect(bad.ingestionError).toContain("toLowerCase");
  });

  it("rolls back the entire batch (ledger writes and checkpoint alike) if anything in the transaction throws", async () => {
    // Forces a synchronous throw partway through the transaction, after the
    // first message's row has already been built and inserted — proving a
    // partial failure leaves no partial state, not just that individual
    // parse failures are handled gracefully (a different, already-covered
    // case).
    const dateSpy = vi.spyOn(Date, "now").mockImplementationOnce(() => {
      throw new Error("boom");
    });

    await expect(
      ingestSmsBatch([rawSms({ id: "1" }), rawSms({ id: "2", date: 1700000001000 })]),
    ).rejects.toThrow("boom");

    expect(testDb.select().from(schema.smsLedger).all()).toHaveLength(0);
    const [checkpoint] = testDb.select().from(schema.syncCheckpoint).all();
    expect(checkpoint).toBeUndefined();

    dateSpy.mockRestore();
  });

  it("advances the checkpoint to the newest message's date", async () => {
    await ingestSmsBatch([
      rawSms({ id: "1", date: 1000 }),
      rawSms({ id: "2", date: 3000 }),
      rawSms({ id: "3", date: 2000 }),
    ]);

    const status = await getSyncStatus();
    expect(status.lastIngestedDate).toBe(3000);
    expect(status.lastIngestedProviderId).toBe("2");
  });

  it("never moves the checkpoint backwards (a backfill of older history is safe)", async () => {
    await ingestSmsBatch([rawSms({ id: "1", date: 5000 })]);
    await ingestSmsBatch([rawSms({ id: "2", date: 1000 })]);

    const status = await getSyncStatus();
    expect(status.lastIngestedDate).toBe(5000);
  });

  it("resolves to the same maximum checkpoint regardless of which of two overlapping batches runs first", async () => {
    // ingestSmsBatch's transaction body is fully synchronous (see its own
    // comment on why), so two calls can never actually interleave
    // mid-transaction — each runs to completion before the other's
    // transaction begins, regardless of the order their outer async
    // wrappers happen to be scheduled in. This is what makes the race
    // Codex flagged structurally impossible rather than just unlikely.
    const older = ingestSmsBatch([rawSms({ id: "older", date: 1000 })]);
    const newer = ingestSmsBatch([rawSms({ id: "newer", date: 9000 })]);
    await Promise.all([older, newer]);

    expect((await getSyncStatus()).lastIngestedDate).toBe(9000);
  });

  it("getSyncStatus returns nulls before anything has been ingested", async () => {
    const status = await getSyncStatus();
    expect(status.lastIngestedDate).toBeNull();
    expect(status.lastIngestedProviderId).toBeNull();
  });
});

describe("loadDashboard", () => {
  beforeEach(() => {
    testDb = freshDb();
  });

  it("derives a dashboard from ledger rows without re-parsing them", async () => {
    await ingestSmsBatch([rawSms({ id: "1", body: HDFC_DEBIT, sender: "VM-HDFCBK" })]);

    const dashboard = await loadDashboard();
    expect(dashboard.recent).toHaveLength(1);
    expect(dashboard.recent[0]!.result.trx).toBe("5000.00");
  });

  it("excludes ledger rows that failed to parse", async () => {
    await ingestSmsBatch([
      rawSms({ id: "good", body: HDFC_DEBIT }),
      rawSms({ id: "bad", body: null as unknown as string }),
    ]);

    const dashboard = await loadDashboard();
    expect(dashboard.recent.every((m) => m.id !== "bad")).toBe(true);
  });

  it("skips a ledger row with corrupted cached JSON instead of throwing", async () => {
    await ingestSmsBatch([rawSms({ id: "1", body: HDFC_DEBIT })]);

    testDb
      .update(schema.smsLedger)
      .set({ parsedResult: "{not valid json" })
      .where(eq(schema.smsLedger.id, "1"))
      .run();

    const dashboard = await loadDashboard();
    expect(dashboard.recent).toHaveLength(0);
  });
});

describe("loadTransactions", () => {
  beforeEach(() => {
    testDb = freshDb();
  });

  it("filters by date range", async () => {
    await ingestSmsBatch([
      rawSms({ id: "1", body: HDFC_DEBIT, date: 1000 }),
      rawSms({ id: "2", body: HDFC_DEBIT, date: 5000 }),
    ]);

    const filtered = await loadTransactions({ from: 2000 });
    expect(filtered.map((m) => m.id)).toEqual(["2"]);
  });
});
