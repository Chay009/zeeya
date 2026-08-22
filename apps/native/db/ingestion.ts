// The local-first ingestion/read interface (issue #17). Ledger + checkpoint
// only in this pass — see the header comment on loadDashboard for what's
// deliberately deferred to the next slice, and why.
import { createMalanaEngine, PARSER_VERSION } from "@zeeya/parser/malana";
import { eq, inArray, or, sql } from "drizzle-orm";
import { deriveDashboard, type Dashboard } from "../lib/dashboard";
import type { ParsedSms, RawSms } from "../lib/sms";
import { db } from "./client";
import { smsLedger, syncCheckpoint } from "./schema";
import type { Database } from "./client.native";

const engine = createMalanaEngine();

function requireDb(): Database {
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
// synchronous hash is what's needed here, not a cryptographic one. FNV-1a
// run twice with different seeds gives a 64-bit-equivalent hex digest,
// keeping collision probability negligible at this app's realistic
// per-user message scale (thousands, not millions) without pulling in an
// async crypto API. Exported only for direct unit testing of its
// determinism/format/plaintext-absence properties.
export function fnv1a(input: string, seed: number): number {
  let hash = seed;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function computeFingerprint(sender: string, date: number, body: string): string {
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

// Android's on-device SQLite (unlike the desktop build this suite tests
// against — verified directly: better-sqlite3's bundled SQLite handled a
// 3,000-item IN clause fine) has historically defaulted
// SQLITE_MAX_VARIABLE_NUMBER to 999, and there's no way to confirm the real
// figure on-device without a physical test. The existence check below binds
// three IN clauses per chunk (row ids, fingerprints, provider ids), so
// chunking at 250 keeps every single query under 750 bound parameters
// regardless of which default a given device actually ships — comfortable
// margin under 999. This matters for any batch, not just a future backfill
// import: a phone that's been offline for a while can realistically
// accumulate several hundred new messages before the next refresh.
const EXISTENCE_CHECK_CHUNK_SIZE = 250;

// Large enough batches yield control back to the JS event loop periodically
// while parsing (see ingestSmsBatch) so a big catch-up doesn't freeze the UI
// thread for its entire duration in one uninterrupted synchronous stretch.
const PARSE_YIELD_EVERY = 50;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function prepareMessage(message: RawSms): PreparedMessage {
  const body = message.body ?? "";
  const fingerprint = computeFingerprint(message.sender, message.date, body);
  const providerId = message.id || null;
  return { message, fingerprint, providerId, rowId: providerId ?? fingerprint };
}

// Queryable is either the top-level `database` (preflight, before any
// transaction is open) or a `tx` inside one (recheck) — both expose the
// same sync .select()...where()...all() shape, so this one function serves
// both call sites rather than duplicating the chunked-query logic.
type Queryable = Pick<Database, "select">;

function findExistingIdentities(
  queryable: Queryable,
  items: readonly PreparedMessage[],
): {
  byId: Map<string, ExistingIdentity>;
  byFingerprint: Map<string, ExistingIdentity>;
  byProviderId: Map<string, ExistingIdentity>;
} {
  const byId = new Map<string, ExistingIdentity>();
  const byFingerprint = new Map<string, ExistingIdentity>();
  const byProviderId = new Map<string, ExistingIdentity>();

  for (const batch of chunk(items, EXISTENCE_CHECK_CHUNK_SIZE)) {
    const rowIds = batch.map((p) => p.rowId);
    const fingerprints = batch.map((p) => p.fingerprint);
    const providerIds = batch.map((p) => p.providerId).filter((id): id is string => id !== null);

    const conditions = [
      inArray(smsLedger.id, rowIds),
      inArray(smsLedger.fingerprint, fingerprints),
    ];
    // A separate lookup against providerId itself, not just id/fingerprint:
    // an enriched row's `id` stays whatever it was first assigned (its
    // original fingerprint-derived value, if no provider id was available
    // yet at the time) — enrichment only ever sets the `providerId` column,
    // it never renames `id`. Without checking providerId directly, a later
    // batch keyed by that same provider id but with different sender/date/
    // body (a different fingerprint — e.g. corrected metadata from the OS)
    // would match neither `id` nor `fingerprint` on the existing row, get
    // treated as new, and be needlessly reparsed before its insert silently
    // no-ops against the provider_id unique constraint.
    if (providerIds.length > 0) {
      conditions.push(inArray(smsLedger.providerId, providerIds));
    }

    const existingRows = queryable
      .select({
        id: smsLedger.id,
        fingerprint: smsLedger.fingerprint,
        providerId: smsLedger.providerId,
      })
      .from(smsLedger)
      .where(or(...conditions))
      .all();

    for (const row of existingRows) {
      byId.set(row.id, row);
      byFingerprint.set(row.fingerprint, row);
      if (row.providerId) byProviderId.set(row.providerId, row);
    }
  }

  return { byId, byFingerprint, byProviderId };
}

function lookupExisting(
  item: PreparedMessage,
  identities: ReturnType<typeof findExistingIdentities>,
): ExistingIdentity | undefined {
  return (
    identities.byId.get(item.rowId) ??
    identities.byFingerprint.get(item.fingerprint) ??
    (item.providerId ? identities.byProviderId.get(item.providerId) : undefined)
  );
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

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Idempotent and re-parse-free: safe to call repeatedly with overlapping or
// fully-duplicate batches (refresh, restart, background catch-up, backfill
// all call this the same way). A message already present by row id,
// fingerprint, or provider id is never re-parsed. This is what makes
// "restart does not require reparsing the entire inbox" (issue #17's
// acceptance criterion) actually true.
//
// If a row was first ingested with only a fingerprint-derived id (no
// provider id available at the time) and a later batch supplies a real
// provider id for that same fingerprint (or provider id), the existing row
// is enriched with that provider id — not re-parsed.
//
// Parsing happens entirely OUTSIDE any SQLite transaction — engine.parse()
// on hundreds of messages takes real time, and holding a synchronous
// transaction open for that whole duration would block both the JS thread
// and the database itself. The flow is: (1) a read-only preflight existence
// check, no transaction; (2) parse only genuinely-new messages, yielding to
// the event loop periodically for a large batch; (3) a short transaction
// that rechecks existence against current state (another call could have
// inserted some of these rows in the meantime — onConflictDoNothing already
// makes a stale insert harmless, but the recheck lets a message that only
// became enrichable during that window skip an unnecessary insert attempt
// too) and performs all writes plus the checkpoint update together.
//
// That final transaction body is a plain (non-async) function on purpose:
// drizzle's expo-sqlite transaction does NOT await its callback before
// committing (confirmed directly against its source — it calls the
// callback, then immediately runs COMMIT on the next line), so an async
// callback would commit before its own writes finished running. Since it
// contains no parsing, it stays fast regardless of batch size.
export async function ingestSmsBatch(messages: RawSms[]): Promise<void> {
  const database = requireDb();
  if (messages.length === 0) return;

  const prepared = messages.map(prepareMessage);
  const preflight = findExistingIdentities(database, prepared);

  const toInsert: PreparedMessage[] = [];
  const toEnrich = new Map<string, string>(); // existing row id -> provider id to set
  const seenFingerprints = new Set<string>();
  const seenRowIds = new Set<string>();

  let sinceYield = 0;
  for (const item of prepared) {
    const existing = lookupExisting(item, preflight);
    if (existing) {
      if (item.providerId && !existing.providerId) {
        toEnrich.set(existing.id, item.providerId);
      }
      continue;
    }
    if (seenFingerprints.has(item.fingerprint) || seenRowIds.has(item.rowId)) {
      continue; // duplicate within this batch, already queued for insert
    }
    seenFingerprints.add(item.fingerprint);
    seenRowIds.add(item.rowId);
    toInsert.push(item);

    if (++sinceYield >= PARSE_YIELD_EVERY) {
      await yieldToEventLoop();
      sinceYield = 0;
    }
  }

  const rowsToInsert = toInsert.map(buildLedgerRow);

  const batchNewestDate = Math.max(...messages.map((m) => m.date));
  const batchNewest = messages.find((m) => m.date === batchNewestDate)!;
  const batchNewestProviderId = batchNewest.id || null;

  database.transaction((tx) => {
    // Recheck against current state rather than trusting the preflight
    // snapshot: another ingestSmsBatch call could have inserted or
    // enriched some of these rows in the window between the preflight read
    // and this transaction opening.
    const recheck = findExistingIdentities(tx, toInsert);
    // toInsert and rowsToInsert are the same length, built in the same
    // order (rowsToInsert = toInsert.map(buildLedgerRow)) — zip by index
    // rather than searching rowsToInsert for each item, which would be
    // O(n^2) for a large batch.
    for (let i = 0; i < toInsert.length; i++) {
      const item = toInsert[i]!;
      const row = rowsToInsert[i]!;
      const existingNow = lookupExisting(item, recheck);
      if (existingNow) {
        if (item.providerId && !existingNow.providerId) {
          toEnrich.set(existingNow.id, item.providerId);
        }
        continue;
      }
      tx.insert(smsLedger).values(row).onConflictDoNothing().run();
    }

    for (const [existingId, providerId] of toEnrich) {
      tx.update(smsLedger).set({ providerId }).where(eq(smsLedger.id, existingId)).run();
    }

    // A single conditional upsert, not read-then-write: two overlapping
    // batches (e.g. a foreground refresh and a background catch-up) can no
    // longer race, because the "only if newer" check and the write happen
    // in one SQL statement rather than a separate SELECT the caller then
    // acts on.
    tx.insert(syncCheckpoint)
      .values({
        id: "inbox",
        lastIngestedDate: batchNewestDate,
        lastIngestedProviderId: batchNewestProviderId,
        updatedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: syncCheckpoint.id,
        set: {
          lastIngestedDate: batchNewestDate,
          lastIngestedProviderId: batchNewestProviderId,
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

// A minimal structural sanity check on cached, previously-trusted JSON —
// not a full MalanaResult schema. JSON.parse() only rejects invalid syntax:
// a stored value like "null" or "42" is syntactically valid JSON that
// parses to a non-object, which would then crash deriveDashboard() the
// moment it tries to read a property off it. This catches that class of
// corruption without the weight of validating all 50+ MalanaResult fields
// for a value that (barring corruption) was written by this same code.
function isPlausibleMalanaResult(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && "category" in value;
}

// Reconstructs ParsedSms[] from the ledger's cached parsedResult JSON and
// runs the existing, already-tested deriveDashboard() over it — the exact
// same function apps/native/app/(drawer)/index.tsx already calls today, so
// this returns a bit-identical Dashboard shape, not a reimplementation of
// its reconciliation math (interval-based, sorted-history-dependent — real
// risk to reproduce incrementally without its own dedicated review pass).
// A row whose cached JSON fails to parse, or decodes to something that
// isn't plausibly a MalanaResult, is skipped rather than crashing —
// the same error-isolation principle ingestSmsBatch itself uses.
//
// What this does NOT yet do, deliberately deferred rather than rushed in
// the same pass as ingestion: read from the normalized accounts/
// balanceReadings/transactions/activity/mandates tables directly, and
// detect/reprocess rows whose stored parserVersion is stale (tracked
// explicitly on issue #17, not silently dropped — parserVersion is
// currently write-only). Those tables are part of the locked schema but
// aren't written or read yet — that's a pure optimization on top of this
// (same derivation, cached instead of recomputed on every load), not a
// correctness change, and deserves its own slice, as does version-based
// reprocessing. The real, load-bearing win in this pass is that restart/
// refresh no longer re-parses already-ingested SMS through Malana — only
// deriveDashboard()'s cheap in-memory aggregation reruns.
export async function loadDashboard(now: Date = new Date()): Promise<Dashboard> {
  const database = requireDb();
  const rows = await database.select().from(smsLedger);
  const messages: ParsedSms[] = [];
  for (const row of rows) {
    if (row.ingestionStatus !== "parsed" || !row.parsedResult) continue;
    let decoded: unknown;
    try {
      decoded = JSON.parse(row.parsedResult);
    } catch {
      continue;
    }
    if (!isPlausibleMalanaResult(decoded)) continue;
    messages.push({
      id: row.id,
      sender: row.sender,
      body: row.body,
      date: row.date,
      result: decoded as unknown as ParsedSms["result"],
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
