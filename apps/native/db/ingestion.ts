// The local-first ingestion/read interface (issue #17). Ledger + checkpoint
// only in this pass — see the header comment on loadDashboard for what's
// deliberately deferred to the next slice, and why.
import { createMalanaEngine, PARSER_VERSION } from "@zeeya/parser/malana";
import { eq } from "drizzle-orm";
import { deriveDashboard, type Dashboard } from "../lib/dashboard";
import type { ParsedSms, RawSms } from "../lib/sms";
import { db } from "./client";
import { smsLedger, syncCheckpoint } from "./schema";

const engine = createMalanaEngine();

function requireDb() {
  if (!db) {
    throw new Error(
      "Local database is not available on this platform (see db/client.web.ts) — " +
        "SMS ingestion is Android-only, so this should never be called on web.",
    );
  }
  return db;
}

// ALWAYS computed, regardless of whether the caller's RawSms.id (the
// Android provider _id) is present — see schema.ts's own comment on why a
// provider id alone isn't a sufficient dedup key on its own.
function computeFingerprint(sender: string, date: number, body: string): string {
  return `${sender}|${date}|${body}`;
}

// Parses one message and shapes it into the ledger row this batch will
// upsert — isolated per-message so one bad message (a parser throw) can't
// abort the whole batch; see ingestSmsBatch's use of this.
function buildLedgerRow(message: RawSms) {
  // message.body is typed as a non-null string, but SMS content providers
  // are OS/OEM-defined (see lib/sms.ts's own comment on this) and a real
  // device can hand back null/undefined despite the type. The row's `body`
  // column is NOT NULL (it's the reprocessing source of truth — a row with
  // no body could never be reprocessed anyway), so this must never store
  // the raw value if it's missing; engine.parse() below still receives the
  // original value so the failure is still captured as ingestionStatus
  // "error", not silently swallowed.
  const storedBody = message.body ?? "";
  const fingerprint = computeFingerprint(message.sender, message.date, storedBody);
  const base = {
    id: message.id,
    fingerprint,
    providerId: message.id,
    sender: message.sender,
    body: storedBody,
    date: message.date,
    parserVersion: PARSER_VERSION,
    createdAt: Date.now(),
  };

  try {
    const result = engine.parse(message.body, message.sender);
    return {
      ...base,
      parsedResult: JSON.stringify(result),
      ingestionStatus: "parsed" as const,
      ingestionError: null,
    };
  } catch (error) {
    return {
      ...base,
      parsedResult: null,
      ingestionStatus: "error" as const,
      ingestionError: error instanceof Error ? error.message : String(error),
    };
  }
}

// Idempotent: safe to call repeatedly with overlapping or fully-duplicate
// batches (refresh, restart, background catch-up, backfill all call this
// the same way). A message already present under its id, fingerprint, or
// provider id — whichever unique constraint it collides on — is a no-op,
// not a duplicate row and not a re-parse. This is what makes "restart does
// not require reparsing the entire inbox" (issue #17's acceptance
// criterion) true: the expensive step is engine.parse(), which only runs
// for rows onConflictDoNothing() actually inserts.
export async function ingestSmsBatch(messages: RawSms[]): Promise<void> {
  const database = requireDb();
  if (messages.length === 0) return;

  const rows = messages.map(buildLedgerRow);
  for (const row of rows) {
    await database.insert(smsLedger).values(row).onConflictDoNothing();
  }

  const batchNewestDate = Math.max(...messages.map((m) => m.date));
  const batchNewest = messages.find((m) => m.date === batchNewestDate)!;

  const [existing] = await database
    .select()
    .from(syncCheckpoint)
    .where(eq(syncCheckpoint.id, "inbox"))
    .limit(1);

  // Only advance the checkpoint, never move it backwards — a backfill batch
  // ingesting older history must not regress the "newest seen" marker
  // normal refresh relies on for its overlap window.
  if (
    existing &&
    existing.lastIngestedDate !== null &&
    existing.lastIngestedDate >= batchNewestDate
  ) {
    return;
  }

  await database
    .insert(syncCheckpoint)
    .values({
      id: "inbox",
      lastIngestedDate: batchNewestDate,
      lastIngestedProviderId: batchNewest.id,
      updatedAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: syncCheckpoint.id,
      set: {
        lastIngestedDate: batchNewestDate,
        lastIngestedProviderId: batchNewest.id,
        updatedAt: Date.now(),
      },
    });
}

export interface SyncStatus {
  lastIngestedDate: number | null;
  lastIngestedProviderId: string | null;
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const database = requireDb();
  const [row] = await database
    .select()
    .from(syncCheckpoint)
    .where(eq(syncCheckpoint.id, "inbox"))
    .limit(1);
  return {
    lastIngestedDate: row?.lastIngestedDate ?? null,
    lastIngestedProviderId: row?.lastIngestedProviderId ?? null,
  };
}

// Reconstructs ParsedSms[] from the ledger's cached parsedResult JSON and
// runs the existing, already-tested deriveDashboard() over it — the exact
// same function apps/native/app/(drawer)/index.tsx already calls today, so
// this returns a bit-identical Dashboard shape, not a reimplementation of
// its reconciliation math (interval-based, sorted-history-dependent — real
// risk to reproduce incrementally without its own dedicated review pass).
//
// What this does NOT yet do, deliberately deferred rather than rushed in
// the same pass as ingestion: read from the normalized accounts/
// balanceReadings/transactions/activity/mandates tables directly. Those
// tables are part of the locked schema but aren't written or read yet —
// that's a pure optimization on top of this (same derivation, cached
// instead of recomputed on every load), not a correctness change, and
// deserves its own slice. The real, load-bearing win in this pass is that
// restart/refresh no longer re-parses already-ingested SMS through Malana —
// only deriveDashboard()'s cheap in-memory aggregation reruns.
export async function loadDashboard(now: Date = new Date()): Promise<Dashboard> {
  const database = requireDb();
  const rows = await database.select().from(smsLedger);
  const messages: ParsedSms[] = [];
  for (const row of rows) {
    if (row.ingestionStatus !== "parsed" || !row.parsedResult) continue;
    messages.push({
      id: row.id,
      sender: row.sender,
      body: row.body,
      date: row.date,
      result: JSON.parse(row.parsedResult),
    });
  }
  return deriveDashboard(messages, now);
}

export interface TransactionFilters {
  from?: number;
  to?: number;
}

// Filters the same recognized-financial-transaction list loadDashboard()
// already derives (dashboard.ts's `recent`) rather than querying the
// ledger directly — same reasoning as loadDashboard: reuse the tested
// derivation instead of re-deriving a second, possibly-inconsistent path.
export async function loadTransactions(filters: TransactionFilters = {}): Promise<ParsedSms[]> {
  const dashboard = await loadDashboard();
  return dashboard.recent.filter((m) => {
    if (filters.from !== undefined && m.date < filters.from) return false;
    if (filters.to !== undefined && m.date > filters.to) return false;
    return true;
  });
}
