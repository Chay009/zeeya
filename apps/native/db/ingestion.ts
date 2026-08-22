// The local-first ingestion/read interface (issue #17). Ledger + checkpoint
// only in this pass — see the header comment on loadDashboard for what's
// deliberately deferred to the next slice, and why.
import { createMalanaEngine, PARSER_VERSION } from "@zeeya/parser/malana";
import { eq, inArray, or, sql } from "drizzle-orm";
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

// ── Fingerprint ──────────────────────────────────────────────────────────────
//
// A deterministic hash, not the raw message content: storing
// "${sender}|${date}|${body}" directly would duplicate potentially
// sensitive SMS text (OTPs, account numbers, amounts) inside a large unique
// index for no benefit, and "|" is not actually an unambiguous delimiter —
// a sender or body containing a literal "|" could make two different
// messages hash-collide on the plain string. Length-prefixing each field
// before hashing removes that ambiguity.
//
// This is a dedup key, not a security boundary — a fast, deterministic,
// synchronous hash is what's needed here (synchronous specifically because
// ingestSmsBatch's transaction must stay fully synchronous, see its own
// comment), not a cryptographic one. FNV-1a run twice with different seeds
// gives a 64-bit-equivalent hex digest, keeping collision probability
// negligible at this app's realistic per-user message scale (thousands,
// not millions) without pulling in an async crypto API.
function fnv1a(input: string, seed: number): number {
  let hash = seed;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function computeFingerprint(sender: string, date: number, body: string): string {
  const encoded = `${sender.length}:${sender}|${date}|${body.length}:${body}`;
  const high = fnv1a(encoded, 0x811c9dc5).toString(16).padStart(8, "0");
  const low = fnv1a(encoded, 0x9e3779b9).toString(16).padStart(8, "0");
  return `${high}${low}`;
}

// ── Batch identity — parse only what's genuinely new ────────────────────────

interface ExistingIdentity {
  id: string;
  fingerprint: string;
  providerId: string | null;
}

interface PreparedMessage {
  message: RawSms;
  fingerprint: string;
  providerId: string | null;
  rowId: string;
}

function prepareMessage(message: RawSms): PreparedMessage {
  const body = message.body ?? "";
  const fingerprint = computeFingerprint(message.sender, message.date, body);
  const providerId = message.id || null;
  return { message, fingerprint, providerId, rowId: providerId ?? fingerprint };
}

// Parses one message and shapes it into the ledger row this batch will
// insert — isolated per-message so one bad message (a parser throw) can't
// abort the whole batch.
function buildLedgerRow(prepared: PreparedMessage) {
  const { message, fingerprint, providerId, rowId } = prepared;
  const storedBody = message.body ?? "";
  const base = {
    id: rowId,
    fingerprint,
    providerId,
    sender: message.sender,
    body: storedBody,
    date: message.date,
    parserVersion: PARSER_VERSION,
    createdAt: Date.now(),
  };

  try {
    // message.body is typed as a non-null string, but SMS content
    // providers are OS/OEM-defined (see lib/sms.ts's own comment) and a
    // real device can hand back null/undefined despite the type — pass the
    // original value through so that failure is captured as
    // ingestionStatus "error", not silently masked by storedBody's fallback.
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

// Idempotent and re-parse-free: safe to call repeatedly with overlapping or
// fully-duplicate batches (refresh, restart, background catch-up, backfill
// all call this the same way). A message already present under its row id
// or fingerprint is never re-parsed — existence is checked with one bulk
// query up front, before engine.parse() runs for anything. This is what
// makes "restart does not require reparsing the entire inbox" (issue #17's
// acceptance criterion) actually true.
//
// If a row was first ingested with only a fingerprint-derived id (no
// provider id available at the time) and a later batch supplies a real
// provider id for that same fingerprint, the existing row is enriched with
// that provider id — not re-parsed, since matching fingerprints already
// prove identical content.
//
// The whole body is one transaction, and it is written as a plain
// (non-async) function on purpose: drizzle's expo-sqlite transaction does
// NOT await its callback before committing (confirmed directly against its
// source — it calls the callback, then immediately runs COMMIT on the next
// line), so an async callback would commit before its own writes finished
// running. Making this callback synchronous means every query inside it
// must use the sync .all()/.get()/.run() methods, never .execute()/await —
// and means writing `await` in here is a compile error, not just a
// convention to remember.
export async function ingestSmsBatch(messages: RawSms[]): Promise<void> {
  const database = requireDb();
  if (messages.length === 0) return;

  const prepared = messages.map(prepareMessage);

  database.transaction((tx) => {
    const rowIds = prepared.map((p) => p.rowId);
    const fingerprints = prepared.map((p) => p.fingerprint);
    const existingRows = tx
      .select({
        id: smsLedger.id,
        fingerprint: smsLedger.fingerprint,
        providerId: smsLedger.providerId,
      })
      .from(smsLedger)
      .where(or(inArray(smsLedger.id, rowIds), inArray(smsLedger.fingerprint, fingerprints)))
      .all();

    const byId = new Map<string, ExistingIdentity>();
    const byFingerprint = new Map<string, ExistingIdentity>();
    for (const row of existingRows) {
      byId.set(row.id, row);
      byFingerprint.set(row.fingerprint, row);
    }

    for (const item of prepared) {
      const existing = byId.get(item.rowId) ?? byFingerprint.get(item.fingerprint);
      if (existing) {
        if (item.providerId && !existing.providerId) {
          tx.update(smsLedger)
            .set({ providerId: item.providerId })
            .where(eq(smsLedger.id, existing.id))
            .run();
        }
        continue;
      }

      const row = buildLedgerRow(item);
      tx.insert(smsLedger).values(row).onConflictDoNothing().run();
    }

    const batchNewestDate = Math.max(...messages.map((m) => m.date));
    const batchNewest = messages.find((m) => m.date === batchNewestDate)!;

    // A single conditional upsert, not read-then-write: two overlapping
    // batches (e.g. a foreground refresh and a background catch-up) can no
    // longer race, because the "only if newer" check and the write happen
    // in one SQL statement rather than a separate SELECT the caller then
    // acts on.
    tx.insert(syncCheckpoint)
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
        where: sql`${syncCheckpoint.lastIngestedDate} IS NULL OR ${syncCheckpoint.lastIngestedDate} < ${batchNewestDate}`,
      })
      .run();
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
// A row whose cached JSON fails to parse (corruption, not expected in
// practice but not something the app should crash on) is skipped, not
// thrown — the same error-isolation principle ingestSmsBatch itself uses.
//
// What this does NOT yet do, deliberately deferred rather than rushed in
// the same pass as ingestion: read from the normalized accounts/
// balanceReadings/transactions/activity/mandates tables directly, and
// detect/reprocess rows whose stored parserVersion is stale. Those tables
// are part of the locked schema but aren't written or read yet — that's a
// pure optimization on top of this (same derivation, cached instead of
// recomputed on every load), not a correctness change, and deserves its
// own slice, as does version-based reprocessing. The real, load-bearing win
// in this pass is that restart/refresh no longer re-parses already-
// ingested SMS through Malana — only deriveDashboard()'s cheap in-memory
// aggregation reruns.
export async function loadDashboard(now: Date = new Date()): Promise<Dashboard> {
  const database = requireDb();
  const rows = await database.select().from(smsLedger);
  const messages: ParsedSms[] = [];
  for (const row of rows) {
    if (row.ingestionStatus !== "parsed" || !row.parsedResult) continue;
    try {
      messages.push({
        id: row.id,
        sender: row.sender,
        body: row.body,
        date: row.date,
        result: JSON.parse(row.parsedResult),
      });
    } catch {
      continue;
    }
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
