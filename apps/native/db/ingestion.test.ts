// Runs against a real SQLite database (better-sqlite3, same approach as
// schema.smoke.test.ts) rather than mocking drizzle — the whole point of
// this suite is proving ingestSmsBatch's idempotency and error isolation
// hold against real INSERT/constraint behavior, not against a mock that
// might not reproduce it.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  beforeEach(() => {
    testDb = freshDb();
    vi.resetModules();
  });

  it("persists a real message into the ledger with a parsed result", async () => {
    const { ingestSmsBatch } = await import("./ingestion");
    await ingestSmsBatch([rawSms({ id: "1" })]);

    const rows = testDb.select().from(schema.smsLedger).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ingestionStatus).toBe("parsed");
    expect(rows[0]!.parsedResult).not.toBeNull();
    expect(JSON.parse(rows[0]!.parsedResult!).trx).toBe("5000.00");
  });

  it("is idempotent — re-ingesting the same message does not duplicate or re-parse it", async () => {
    const { ingestSmsBatch } = await import("./ingestion");
    const message = rawSms({ id: "1" });

    await ingestSmsBatch([message]);
    await ingestSmsBatch([message]);
    await ingestSmsBatch([message]);

    expect(testDb.select().from(schema.smsLedger).all()).toHaveLength(1);
  });

  it("does not duplicate under a fingerprint collision even with a different provider id", async () => {
    const { ingestSmsBatch } = await import("./ingestion");
    const message = rawSms({ id: "1" });
    await ingestSmsBatch([message]);

    // Same sender/date/body (same fingerprint) but a different provider id —
    // the exact cross-scheme collision schema.ts's fingerprint column exists
    // to catch. onConflictDoNothing() with no target catches this too.
    await ingestSmsBatch([{ ...message, id: "different-provider-id" }]);

    expect(testDb.select().from(schema.smsLedger).all()).toHaveLength(1);
  });

  it("processes a batch of distinct real messages independently", async () => {
    const { ingestSmsBatch } = await import("./ingestion");
    await ingestSmsBatch([
      rawSms({ id: "1", body: HDFC_DEBIT, sender: "VM-HDFCBK" }),
      rawSms({ id: "2", body: SBI_UPI, sender: "VM-SBIINB", date: 1700000001000 }),
    ]);

    const rows = testDb.select().from(schema.smsLedger).all();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.ingestionStatus === "parsed")).toBe(true);
  });

  it("isolates a parse failure to that one message instead of aborting the whole batch", async () => {
    const { ingestSmsBatch } = await import("./ingestion");
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

  it("advances the checkpoint to the newest message's date", async () => {
    const { ingestSmsBatch, getSyncStatus } = await import("./ingestion");
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
    const { ingestSmsBatch, getSyncStatus } = await import("./ingestion");
    await ingestSmsBatch([rawSms({ id: "1", date: 5000 })]);
    await ingestSmsBatch([rawSms({ id: "2", date: 1000 })]);

    const status = await getSyncStatus();
    expect(status.lastIngestedDate).toBe(5000);
  });

  it("getSyncStatus returns nulls before anything has been ingested", async () => {
    const { getSyncStatus } = await import("./ingestion");
    const status = await getSyncStatus();
    expect(status.lastIngestedDate).toBeNull();
    expect(status.lastIngestedProviderId).toBeNull();
  });
});

describe("loadDashboard", () => {
  beforeEach(() => {
    testDb = freshDb();
    vi.resetModules();
  });

  it("derives a dashboard from ledger rows without re-parsing them", async () => {
    const { ingestSmsBatch, loadDashboard } = await import("./ingestion");
    await ingestSmsBatch([rawSms({ id: "1", body: HDFC_DEBIT, sender: "VM-HDFCBK" })]);

    const dashboard = await loadDashboard();
    expect(dashboard.recent).toHaveLength(1);
    expect(dashboard.recent[0]!.result.trx).toBe("5000.00");
  });

  it("excludes ledger rows that failed to parse", async () => {
    const { ingestSmsBatch, loadDashboard } = await import("./ingestion");
    await ingestSmsBatch([
      rawSms({ id: "good", body: HDFC_DEBIT }),
      rawSms({ id: "bad", body: null as unknown as string }),
    ]);

    const dashboard = await loadDashboard();
    expect(dashboard.recent.every((m) => m.id !== "bad")).toBe(true);
  });
});

describe("loadTransactions", () => {
  beforeEach(() => {
    testDb = freshDb();
    vi.resetModules();
  });

  it("filters by date range", async () => {
    const { ingestSmsBatch, loadTransactions } = await import("./ingestion");
    await ingestSmsBatch([
      rawSms({ id: "1", body: HDFC_DEBIT, date: 1000 }),
      rawSms({ id: "2", body: HDFC_DEBIT, date: 5000 }),
    ]);

    const filtered = await loadTransactions({ from: 2000 });
    expect(filtered.map((m) => m.id)).toEqual(["2"]);
  });
});
