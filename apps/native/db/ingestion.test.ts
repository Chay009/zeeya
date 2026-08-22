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

const { ingestSmsBatch, getSyncStatus, loadDashboard, loadTransactions, computeFingerprint } =
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

  it("finds an already-enriched row by provider id even when a later message's fingerprint differs", async () => {
    // Enrichment only ever sets the providerId column — it never renames
    // the row's `id`, which stays whatever it was first assigned (the
    // fingerprint, here). Without a providerId lookup, a later message
    // carrying the same provider id but different content (a different
    // fingerprint — e.g. corrected metadata from the OS) would match
    // neither `id` nor `fingerprint` on the existing row, get treated as
    // new, and be needlessly reparsed before its insert silently no-ops
    // against the provider_id unique constraint. This is the exact gap the
    // providerId lookup in findExistingIdentities exists to close.
    const first = rawSms({ id: "", date: 1000, body: HDFC_DEBIT });
    await ingestSmsBatch([first]);
    await ingestSmsBatch([{ ...first, id: "provider-999" }]);
    expect(parseSpy).toHaveBeenCalledTimes(1);

    await ingestSmsBatch([{ ...first, id: "provider-999", body: SBI_UPI, date: 2000 }]);

    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(testDb.select().from(schema.smsLedger).all()).toHaveLength(1);
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

  it("merges a same-batch missing-id/provider-id pair the same way regardless of array order (missing-id first)", async () => {
    // The exact order-dependence bug: a naive "first one in wins, later
    // duplicates are discarded" dedup would keep whichever copy appeared
    // first and silently drop the other's provider id if it came second.
    // groupByFingerprint merges by fingerprint before any insert decision
    // is made, so the outcome must be identical regardless of which copy
    // the caller happened to list first.
    const withId = rawSms({ id: "provider-1", date: 4242 });
    const withoutId = { ...withId, id: "" };

    await ingestSmsBatch([withoutId, withId]);

    expect(parseSpy).toHaveBeenCalledTimes(1);
    const rows = testDb.select().from(schema.smsLedger).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.providerId).toBe("provider-1");
  });

  it("merges a same-batch missing-id/provider-id pair the same way regardless of array order (provider-id first)", async () => {
    const withId = rawSms({ id: "provider-2", date: 4343 });
    const withoutId = { ...withId, id: "" };

    await ingestSmsBatch([withId, withoutId]);

    expect(parseSpy).toHaveBeenCalledTimes(1);
    const rows = testDb.select().from(schema.smsLedger).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.providerId).toBe("provider-2");
  });

  it("does not let a stale enrichment overwrite a row a competing call already enriched with a different provider id", async () => {
    // Genuinely exploits the real yield point, rather than simulating the
    // race by mutating the DB before any read happens (which would only
    // prove the preflight itself is correct — already true before this fix
    // — and never actually exercise the transactional recheck at all).
    //
    // Call A's batch pairs an enrichment candidate for row R with 60 filler
    // messages so its parse loop genuinely yields (see PARSE_YIELD_EVERY).
    // Call A's preflight runs first and records R as enrichable with
    // provider-A. A then yields at message 50. Because JS is single-
    // threaded, call B — invoked on the very next line, only reachable
    // once A's synchronous portion returns control at that yield — runs
    // to completion (its own transaction included) entirely within that
    // window, enriching R with provider-B, before A resumes. By the time
    // A's own transaction opens, its recorded "enrich with provider-A"
    // decision is stale: R already has provider-B.
    const noProviderId = rawSms({ id: "", date: 6161 });
    await ingestSmsBatch([noProviderId]);

    const enrichWithA = { ...noProviderId, id: "provider-A" };
    const filler = Array.from({ length: 60 }, (_, i) =>
      rawSms({ id: `race-filler-${i}`, date: 700000 + i }),
    );
    const callA = ingestSmsBatch([enrichWithA, ...filler]);
    const callB = ingestSmsBatch([{ ...noProviderId, id: "provider-B" }]);
    await Promise.all([callA, callB]);

    const [rowAfter] = testDb
      .select()
      .from(schema.smsLedger)
      .where(
        eq(
          schema.smsLedger.fingerprint,
          computeFingerprint(noProviderId.sender, noProviderId.date, noProviderId.body),
        ),
      )
      .all();
    expect(rowAfter!.providerId).toBe("provider-B");
  });

  it("keeps both messages as separate rows when two genuinely different messages share one provider id, recording the conflict", async () => {
    // Two distinct SMS (different sender/date/body -> different
    // fingerprints) sharing a literal provider id. The provider_id column
    // is unique, so only one row can actually hold it — but that must not
    // mean the other message's content is discarded: it's inserted as its
    // own row, keyed by its own fingerprint, with the contested provider
    // id recorded rather than silently dropped. Ownership goes to the
    // newest of the two (deterministic, order-independent — verified by
    // the reverse-order test below).
    const older = rawSms({ id: "provider-SHARED", date: 8080, sender: "VM-HDFCBK" });
    const newer = rawSms({
      id: "provider-SHARED",
      date: 8181,
      sender: "VM-ICICI",
      body: "INR 200.00 debited from account XX2222 on 10-08-2026. Avail Bal: INR 300.00",
    });

    await ingestSmsBatch([older, newer]);

    expect(parseSpy).toHaveBeenCalledTimes(2);
    const rows = testDb.select().from(schema.smsLedger).all();
    expect(rows).toHaveLength(2);

    const winner = rows.find((r) => r.providerId === "provider-SHARED");
    const loser = rows.find((r) => r.providerId === null);
    expect(winner).toBeDefined();
    expect(loser).toBeDefined();
    expect(winner!.date).toBe(8181); // the newer message won the contested id
    expect(loser!.date).toBe(8080);
    expect(loser!.contestedProviderId).toBe("provider-SHARED");
    // Every stored row's fingerprint must actually describe its own
    // stored sender/date/body — not an arbitrary component representative.
    expect(winner!.fingerprint).toBe(
      computeFingerprint(winner!.sender, winner!.date, winner!.body),
    );
    expect(loser!.fingerprint).toBe(computeFingerprint(loser!.sender, loser!.date, loser!.body));
  });

  it("resolves the same provider-id contention winner regardless of array order", async () => {
    const older = rawSms({ id: "provider-ORDER", date: 8080, sender: "VM-HDFCBK" });
    const newer = rawSms({
      id: "provider-ORDER",
      date: 8181,
      sender: "VM-ICICI",
      body: "INR 200.00 debited from account XX2222 on 10-08-2026. Avail Bal: INR 300.00",
    });

    await ingestSmsBatch([newer, older]); // reverse of the test above

    const rows = testDb.select().from(schema.smsLedger).all();
    const winner = rows.find((r) => r.providerId === "provider-ORDER");
    expect(winner!.date).toBe(8181);
  });

  it("advances the checkpoint from the true newest raw message even when it lost provider-id contention", async () => {
    // The checkpoint must reflect the batch's actual newest message, never
    // an arbitrary per-group representative — including when that newest
    // message is the one that lost provider-id contention (and so isn't
    // the row holding the checkpoint's own provider id).
    const older = rawSms({ id: "provider-CKPT", date: 100, sender: "VM-HDFCBK" });
    const newerLoser = rawSms({
      id: "provider-CKPT",
      date: 200,
      sender: "VM-ICICI",
      body: "distinct content",
    });

    await ingestSmsBatch([older, newerLoser]);

    const status = await getSyncStatus();
    expect(status.lastIngestedDate).toBe(200);
  });

  it("does not throw or roll back the batch when an incoming fingerprint and provider id resolve to two different existing rows", async () => {
    // Row B starts fingerprint-only, then is legitimately enriched later
    // (so its `id` column stays its original fingerprint value while only
    // its `providerId` *column* becomes the shared value) — the exact
    // shape that made the old fixed-precedence lookupExisting() fall
    // through byId, match a *different* row A via byFingerprint, and then
    // attempt `UPDATE ... SET providerId = ... WHERE id = A.id`, which
    // violges the provider_id unique constraint B already holds and rolls
    // back the whole transaction.
    const bSeed = rawSms({ id: "", date: 9090, sender: "VM-SBI", body: "seed for row B" });
    await ingestSmsBatch([bSeed]);
    await ingestSmsBatch([{ ...bSeed, id: "provider-CONTESTED" }]); // legitimately enrich B

    const rowA = rawSms({ id: "", date: 9191, sender: "VM-AXIS", body: "row A content" });
    await ingestSmsBatch([rowA]);

    // Conflicting message: A's fingerprint (same sender/date/body as rowA),
    // but claims B's provider id.
    await expect(ingestSmsBatch([{ ...rowA, id: "provider-CONTESTED" }])).resolves.toBeUndefined();

    const rows = testDb.select().from(schema.smsLedger).all();
    const rowBAfter = rows.find((r) => r.providerId === "provider-CONTESTED");
    const rowAAfter = rows.find(
      (r) => r.fingerprint === computeFingerprint(rowA.sender, rowA.date, rowA.body ?? ""),
    );
    // B keeps the provider id it legitimately earned; A is recognized by
    // its fingerprint and is not corrupted into claiming B's provider id —
    // but the conflict is recorded on A rather than silently dropped.
    expect(rowBAfter).toBeDefined();
    expect(rowAAfter).toBeDefined();
    expect(rowAAfter!.providerId).not.toBe("provider-CONTESTED");
    expect(rowAAfter!.contestedProviderId).toBe("provider-CONTESTED");
  });

  it("records the conflict, without throwing, when a concurrent call claims the proposed provider id between preflight and the enrichment write", async () => {
    // The narrower race Codex's spec review named specifically: call A's
    // preflight queues an enrichment (row R + provider id P), yields
    // during its parse loop, and — only reachable once A's synchronous
    // portion actually yields — call B runs to completion in that window
    // and gives provider id P to a *different* row, R2. By the time A's
    // transaction opens and re-checks R2's ownership immediately before
    // writing, P no longer belongs to R; the enrichment must be skipped
    // and recorded, not attempted (which would throw on the unique index).
    const rSeed = rawSms({ id: "", date: 5050, sender: "VM-KOTAK", body: "row R seed" });
    await ingestSmsBatch([rSeed]);

    const enrichR = { ...rSeed, id: "provider-RACE" };
    const filler = Array.from({ length: 60 }, (_, i) =>
      rawSms({ id: `race2-filler-${i}`, date: 800000 + i }),
    );
    const callA = ingestSmsBatch([enrichR, ...filler]);
    const r2Seed = rawSms({
      id: "provider-RACE",
      date: 5151,
      sender: "VM-YES",
      body: "row R2, a different message claiming the same provider id",
    });
    const callB = ingestSmsBatch([r2Seed]);
    await expect(Promise.all([callA, callB])).resolves.toBeDefined();

    const rows = testDb.select().from(schema.smsLedger).all();
    const rowR = rows.find(
      (r) => r.fingerprint === computeFingerprint(rSeed.sender, rSeed.date, rSeed.body ?? ""),
    );
    const rowR2 = rows.find((r) => r.providerId === "provider-RACE");
    expect(rowR2).toBeDefined();
    expect(rowR).toBeDefined();
    expect(rowR!.providerId).not.toBe("provider-RACE");
    expect(rowR!.contestedProviderId).toBe("provider-RACE");
  });

  it("actually yields while parsing, not merely while classifying messages", async () => {
    // A batch of exactly PARSE_YIELD_EVERY (50) new messages should trigger
    // at least one yield during the parse loop itself — the bug this
    // replaces yielded only in an earlier classification loop, so parsing
    // 50+ messages still ran as one uninterrupted synchronous block
    // regardless of that classification-loop yield.
    const setTimeoutSpy = vi.spyOn(global, "setTimeout");
    const batch = Array.from({ length: 50 }, (_, i) =>
      rawSms({ id: `yield-${i}`, date: 1700000000000 + i }),
    );

    await ingestSmsBatch(batch);

    expect(setTimeoutSpy).toHaveBeenCalled();
    setTimeoutSpy.mockRestore();
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

  it("rolls back writes that already succeeded inside the transaction if a later step in it throws", async () => {
    // Parsing (and its Date.now() calls in buildLedgerRow) now happens
    // outside the transaction, so a mock that throws on an early call would
    // never even reach the transaction — it would prove nothing about
    // rollback. Instead this lets both messages' Date.now() calls during
    // parsing succeed normally, then throws on the very next call, which
    // happens while building the checkpoint upsert's `values`/`set`
    // objects — by which point both messages' INSERT statements have
    // already run inside the transaction. This is what proves a partial
    // success inside the transaction gets rolled back, not just that a
    // failure before any writes leaves no writes (which would be true even
    // without a real transaction).
    const realDateNow = Date.now.bind(Date);
    let calls = 0;
    const dateSpy = vi.spyOn(Date, "now").mockImplementation(() => {
      calls++;
      if (calls > 2) throw new Error("boom");
      return realDateNow();
    });

    await expect(
      ingestSmsBatch([rawSms({ id: "1" }), rawSms({ id: "2", date: 1700000001000 })]),
    ).rejects.toThrow("boom");

    // Both messages were genuinely parsed and inserted inside the
    // transaction before the checkpoint step threw — if rollback weren't
    // real, these rows would still be present.
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

  it("stores null, not an empty string, when the newest message has no provider id", async () => {
    await ingestSmsBatch([rawSms({ id: "", date: 1000 })]);

    const status = await getSyncStatus();
    expect(status.lastIngestedProviderId).toBeNull();
  });

  it("never moves the checkpoint backwards (a backfill of older history is safe)", async () => {
    await ingestSmsBatch([rawSms({ id: "1", date: 5000 })]);
    await ingestSmsBatch([rawSms({ id: "2", date: 1000 })]);

    const status = await getSyncStatus();
    expect(status.lastIngestedDate).toBe(5000);
  });

  it("resolves to the same maximum checkpoint when two large, genuinely-interleaving batches overlap", async () => {
    // Single-message batches never cross PARSE_YIELD_EVERY (50), so they
    // never actually yield mid-parse — calling ingestSmsBatch twice with
    // those never gives the two calls a real chance to interleave, only an
    // appearance of testing concurrency. 60 messages each does cross the
    // threshold, so both calls genuinely yield control back to the event
    // loop mid-parse, and can actually interleave before either reaches its
    // write transaction. The atomic conditional upsert (WHERE
    // excluded.date > current.date) is what guarantees correctness through
    // that real interleaving, not an absence of it.
    const olderBatch = Array.from({ length: 60 }, (_, i) =>
      rawSms({ id: `older-${i}`, date: 1000 + i }),
    );
    const newerBatch = Array.from({ length: 60 }, (_, i) =>
      rawSms({ id: `newer-${i}`, date: 900000 + i }),
    );

    await Promise.all([ingestSmsBatch(olderBatch), ingestSmsBatch(newerBatch)]);
    expect((await getSyncStatus()).lastIngestedDate).toBe(900000 + 59);
  });

  it("resolves to the same maximum checkpoint with the reverse call order too", async () => {
    const olderBatch = Array.from({ length: 60 }, (_, i) =>
      rawSms({ id: `older2-${i}`, date: 1000 + i }),
    );
    const newerBatch = Array.from({ length: 60 }, (_, i) =>
      rawSms({ id: `newer2-${i}`, date: 900000 + i }),
    );

    await Promise.all([ingestSmsBatch(newerBatch), ingestSmsBatch(olderBatch)]);
    expect((await getSyncStatus()).lastIngestedDate).toBe(900000 + 59);
  });

  it("getSyncStatus returns nulls before anything has been ingested", async () => {
    const status = await getSyncStatus();
    expect(status.lastIngestedDate).toBeNull();
    expect(status.lastIngestedProviderId).toBeNull();
  });
});

describe("computeFingerprint", () => {
  it("is deterministic for identical inputs", () => {
    expect(computeFingerprint("VM-HDFCBK", 1700000000000, HDFC_DEBIT)).toBe(
      computeFingerprint("VM-HDFCBK", 1700000000000, HDFC_DEBIT),
    );
  });

  it("produces a fixed-length lowercase hex digest regardless of input length", () => {
    const short = computeFingerprint("A", 1, "B");
    const long = computeFingerprint("VM-HDFCBK", 1700000000000, HDFC_DEBIT);
    expect(short).toMatch(/^[0-9a-f]{16}$/);
    expect(long).toMatch(/^[0-9a-f]{16}$/);
  });

  it("never contains the raw SMS content it was derived from", () => {
    const secret = "SUPER_SECRET_OTP_654321";
    const fp = computeFingerprint("VM-HDFCBK", 1700000000000, secret);
    expect(fp).not.toContain(secret);
    expect(fp).not.toContain("SECRET");
    expect(fp).not.toContain("VM-HDFCBK");
  });

  it("distinguishes field splits that would collide under naive delimiter concatenation", () => {
    // A raw "${sender}|${date}|${body}" scheme would make these two equal:
    // sender="X|Y", body="Z" vs sender="X", body="Y|Z" both stringify to
    // "X|Y|5|Z" style ambiguity. Length-prefixing must keep them distinct.
    expect(computeFingerprint("X|Y", 5, "Z")).not.toBe(computeFingerprint("X", 5, "Y|Z"));
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

  it("skips a ledger row whose cached JSON is syntactically valid but not a MalanaResult shape", async () => {
    // JSON.parse('"null"') doesn't throw — it returns the JS value null,
    // which is exactly what would crash deriveDashboard() the moment it
    // tries to read a property off it. This is the case a bare try/catch
    // around JSON.parse() can't catch, since parsing itself succeeds.
    await ingestSmsBatch([rawSms({ id: "1", body: HDFC_DEBIT })]);

    testDb
      .update(schema.smsLedger)
      .set({ parsedResult: "null" })
      .where(eq(schema.smsLedger.id, "1"))
      .run();

    await expect(loadDashboard()).resolves.toBeDefined();
    const dashboard = await loadDashboard();
    expect(dashboard.recent).toHaveLength(0);
  });

  it("skips a ledger row whose cached JSON is valid but has the wrong field types, not just wrong shape", async () => {
    // { category: "GRM_BANK", ref: 3 } passes a shallow "is an object with
    // a category key" check but would crash the moment downstream code
    // calls a string method on `ref` (dashboard.ts's referencedTransactionKey
    // does exactly this). parsePersistedMalanaResult validates every
    // field's type, not just the object's top-level shape.
    await ingestSmsBatch([rawSms({ id: "1", body: HDFC_DEBIT })]);

    const [row] = testDb.select().from(schema.smsLedger).all();
    const corrupted = { ...JSON.parse(row!.parsedResult!), ref: 3 };
    testDb
      .update(schema.smsLedger)
      .set({ parsedResult: JSON.stringify(corrupted) })
      .where(eq(schema.smsLedger.id, "1"))
      .run();

    await expect(loadDashboard()).resolves.toBeDefined();
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
