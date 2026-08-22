// The local-first ingestion/read interface (issue #17). Ledger + checkpoint
// only in this pass — see the header comment on loadDashboard for what's
// deliberately deferred to the next slice, and why.
import {
  createMalanaEngine,
  parsePersistedMalanaResult,
  PARSER_VERSION,
} from "@zeeya/parser/malana";
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

// ── Batch identity — group, merge, then decide what's genuinely new ─────────

interface ExistingIdentity {
  id: string;
  fingerprint: string;
  providerId: string | null;
}

interface PreparedMessage {
  message: RawSms;
  fingerprint: string;
  providerId: string | null;
}

// One fingerprint's worth of the incoming batch, after merging every
// message that shares it (see groupByFingerprint) — the unit ingestSmsBatch
// actually operates on downstream of this point.
interface MergedGroup {
  fingerprint: string;
  providerId: string | null;
  rowId: string;
  representative: RawSms;
}

function prepareMessage(message: RawSms): PreparedMessage {
  const body = message.body ?? "";
  const fingerprint = computeFingerprint(message.sender, message.date, body);
  return { message, fingerprint, providerId: message.id || null };
}

// Collapses every message in the batch sharing an identity — same
// fingerprint, OR same non-null provider id — into one group with one
// deterministically-merged fingerprint/provider id, regardless of which
// order the caller happened to list them in. This has to merge on *either*
// key, not fingerprint alone: two messages in the same batch can carry the
// same provider id while differing in fingerprint (e.g. the OS handed back
// slightly different metadata for what the SMS provider considers a single
// message). Grouping by fingerprint alone put those in separate groups
// that both computed the same rowId (providerId ?? fingerprint) and then
// raced to insert under that id — onConflictDoNothing() silently kept
// whichever inserted first and discarded the other's entire row. Merging
// transitively (union-find over "shares a fingerprint" and "shares a
// provider id" edges) guarantees at most one group, and therefore at most
// one insert attempt, per identity actually present in the batch.
//
// Two entries with the same fingerprint (or same provider id) are the same
// underlying SMS content by construction, so there is exactly one identity
// to resolve per connected component, not one decision per array position:
// picking "whichever one appears first in the input array" meant a batch
// of [no-provider-id copy, provider-id copy] silently discarded the
// provider id, while the reverse order kept it — the same two messages
// producing two different outcomes depending on array order is not a real
// identity rule. Sorting candidate fingerprints/provider ids and taking
// the lexicographically smallest of each is: if more than one message in
// the batch legitimately carries different non-null values for the same
// merged identity (a real duplicate SMS row on-device with slightly
// different metadata), some deterministic tiebreak is required, and any
// fixed one works equally well since which candidate "owns" the row is not
// otherwise distinguishable — the important property is that it doesn't
// depend on input order.
function groupByFingerprint(prepared: readonly PreparedMessage[]): MergedGroup[] {
  // Union-find over prepared[] indices, unioning on shared fingerprint or
  // shared non-null provider id.
  const parent = prepared.map((_, i) => i);
  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  }
  function union(a: number, b: number): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootA] = rootB;
  }

  const firstByFingerprint = new Map<string, number>();
  const firstByProviderId = new Map<string, number>();
  prepared.forEach((item, i) => {
    const fpFirst = firstByFingerprint.get(item.fingerprint);
    if (fpFirst === undefined) firstByFingerprint.set(item.fingerprint, i);
    else union(i, fpFirst);

    if (item.providerId !== null) {
      const pidFirst = firstByProviderId.get(item.providerId);
      if (pidFirst === undefined) firstByProviderId.set(item.providerId, i);
      else union(i, pidFirst);
    }
  });

  const components = new Map<number, PreparedMessage[]>();
  prepared.forEach((item, i) => {
    const root = find(i);
    const list = components.get(root);
    if (list) list.push(item);
    else components.set(root, [item]);
  });

  const groups: MergedGroup[] = [];
  for (const items of components.values()) {
    const fingerprint = items.map((i) => i.fingerprint).sort()[0]!;
    const providerIds = items
      .map((i) => i.providerId)
      .filter((id): id is string => id !== null)
      .sort();
    const providerId = providerIds[0] ?? null;
    groups.push({
      fingerprint,
      providerId,
      rowId: providerId ?? fingerprint,
      representative: items[0]!.message,
    });
  }
  return groups;
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

// engine.parse() on a real message is not free; yielding only between
// cheap bookkeeping steps (as an earlier version of this function did)
// doesn't prevent a large batch's actual parsing from running as one
// uninterrupted synchronous block. This yields after every N real parse
// calls specifically, so a big catch-up genuinely can't freeze the JS
// thread for its entire duration.
const PARSE_YIELD_EVERY = 50;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// Queryable is either the top-level `database` (preflight, before any
// transaction is open) or a `tx` inside one (recheck) — both expose the
// same sync .select()...where()...all() shape, so this one function serves
// both call sites rather than duplicating the chunked-query logic.
type Queryable = Pick<Database, "select">;

interface ExistingIdentities {
  byId: Map<string, ExistingIdentity>;
  byFingerprint: Map<string, ExistingIdentity>;
  byProviderId: Map<string, ExistingIdentity>;
}

function findExistingIdentities(
  queryable: Queryable,
  groups: readonly Pick<MergedGroup, "rowId" | "fingerprint" | "providerId">[],
): ExistingIdentities {
  const byId = new Map<string, ExistingIdentity>();
  const byFingerprint = new Map<string, ExistingIdentity>();
  const byProviderId = new Map<string, ExistingIdentity>();

  for (const batch of chunk(groups, EXISTENCE_CHECK_CHUNK_SIZE)) {
    const rowIds = batch.map((g) => g.rowId);
    const fingerprints = batch.map((g) => g.fingerprint);
    const providerIds = batch.map((g) => g.providerId).filter((id): id is string => id !== null);

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

// A group can match an existing row via up to three independent keys (its
// own id, its fingerprint, its provider id). Those three lookups normally
// agree — they're different keys into the same row — but they don't have
// to: if this group's fingerprint belongs to existing row A while its
// provider id belongs to a *different* existing row B (e.g. B was
// enriched with a provider id that a corrupted/duplicated incoming message
// now also claims for A's content), a fixed precedence order (id, then
// fingerprint, then provider id) would arbitrarily pick one of A or B
// depending on incidental data shape — and if it picks A, the caller then
// tries to enrich A with a provider id that already belongs to B, which
// throws on the provider_id unique constraint and rolls back the entire
// batch transaction, not just this one group.
//
// This is a genuine identity conflict, not something a lookup order can
// correctly resolve — so it's detected and reported as such (`conflict:
// true`) rather than silently resolved. The caller treats a conflict as
// "this content already exists" (via the fingerprint match) without
// attempting the enrichment that would corrupt row B's provider id.
function lookupExisting(
  group: Pick<MergedGroup, "rowId" | "fingerprint" | "providerId">,
  identities: ExistingIdentities,
): { existing: ExistingIdentity | undefined; conflict: boolean } {
  const byId = identities.byId.get(group.rowId);
  const byFingerprint = identities.byFingerprint.get(group.fingerprint);
  const byProviderId = group.providerId ? identities.byProviderId.get(group.providerId) : undefined;

  const candidates = [byId, byFingerprint, byProviderId].filter(
    (c): c is ExistingIdentity => c !== undefined,
  );
  const distinctIds = new Set(candidates.map((c) => c.id));
  if (distinctIds.size > 1) {
    // Prefer the fingerprint match as "the" existing row for this
    // content — it's the strongest identity signal (content-derived, not
    // caller-supplied), and matches what the message actually *is*.
    return { existing: byFingerprint ?? candidates[0], conflict: true };
  }
  return { existing: candidates[0], conflict: false };
}

// Parses one message and shapes it into the ledger row this batch will
// insert — isolated per-message so one bad message (a parser throw) can't
// abort the whole batch.
function buildLedgerRow(group: MergedGroup) {
  const message = group.representative;
  const storedBody = message.body ?? "";
  const base = {
    id: group.rowId,
    fingerprint: group.fingerprint,
    providerId: group.providerId,
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
// Flow: (1) group the incoming batch by fingerprint and merge each group's
// provider identity deterministically (see groupByFingerprint — this is
// also what makes same-batch duplicates order-independent); (2) a read-only
// preflight existence check, no transaction; (3) parse only genuinely-new
// groups, yielding to the event loop after every PARSE_YIELD_EVERY actual
// parse calls (not merely every N loop iterations) so a large batch's
// parsing itself can't freeze the JS thread for its whole duration; (4) a
// short transaction that rechecks both insertions and enrichments against
// current state — another call could have inserted or enriched some of
// these rows in the window since the preflight read — applies enrichments
// only where providerId is still actually null, inserts rows, and
// conditionally advances the checkpoint.
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

  const groups = groupByFingerprint(messages.map(prepareMessage));
  const preflight = findExistingIdentities(database, groups);

  const toInsertGroups: MergedGroup[] = [];
  const toEnrich = new Map<string, string>(); // existing row id -> provider id to set

  for (const group of groups) {
    const { existing, conflict } = lookupExisting(group, preflight);
    if (existing) {
      if (!conflict && group.providerId && !existing.providerId) {
        toEnrich.set(existing.id, group.providerId);
      }
      continue;
    }
    toInsertGroups.push(group);
  }

  const rowsToInsert: ReturnType<typeof buildLedgerRow>[] = [];
  let parseCallsSinceYield = 0;
  for (const group of toInsertGroups) {
    rowsToInsert.push(buildLedgerRow(group));
    if (++parseCallsSinceYield >= PARSE_YIELD_EVERY) {
      await yieldToEventLoop();
      parseCallsSinceYield = 0;
    }
  }

  // Derived from the same merged groups the ledger actually writes, not
  // the raw incoming messages — using the raw array here let this
  // disagree with the ledger's own identity resolution whenever more than
  // one raw message shared both a fingerprint and the batch's max date
  // (Array.find's "first in input order" pick is not the same value as
  // groupByFingerprint's deterministic lexicographic-smallest merge), making
  // this purely-informational checkpoint field silently input-order-
  // dependent even though nothing else about the batch was.
  const batchNewestDate = Math.max(...groups.map((g) => g.representative.date));
  const batchNewestGroups = groups
    .filter((g) => g.representative.date === batchNewestDate)
    .map((g) => g.providerId)
    .filter((id): id is string => id !== null)
    .sort();
  const batchNewestProviderId = batchNewestGroups[0] ?? null;

  database.transaction((tx) => {
    // Recheck insertions against current state rather than trusting the
    // preflight snapshot: another ingestSmsBatch call could have inserted
    // some of these rows in the window between the preflight read and this
    // transaction opening.
    const recheck = findExistingIdentities(tx, toInsertGroups);
    for (let i = 0; i < toInsertGroups.length; i++) {
      const group = toInsertGroups[i]!;
      const row = rowsToInsert[i]!;
      const { existing: existingNow, conflict } = lookupExisting(group, recheck);
      if (existingNow) {
        if (!conflict && group.providerId && !existingNow.providerId) {
          toEnrich.set(existingNow.id, group.providerId);
        }
        continue;
      }
      tx.insert(smsLedger).values(row).onConflictDoNothing().run();
    }

    // Enrichment candidates from the preflight are revalidated here too,
    // not just applied blindly: another call could have enriched (or even
    // conflictingly enriched) the same row in that same window. Only apply
    // when the row's providerId is still actually null at write time.
    if (toEnrich.size > 0) {
      const enrichIds = [...toEnrich.keys()];
      const currentProviderIds = new Map<string, string | null>();
      for (const batch of chunk(enrichIds, EXISTENCE_CHECK_CHUNK_SIZE)) {
        for (const row of tx
          .select({ id: smsLedger.id, providerId: smsLedger.providerId })
          .from(smsLedger)
          .where(inArray(smsLedger.id, batch))
          .all()) {
          currentProviderIds.set(row.id, row.providerId);
        }
      }
      for (const [existingId, providerId] of toEnrich) {
        if (currentProviderIds.get(existingId) !== null) continue;
        tx.update(smsLedger).set({ providerId }).where(eq(smsLedger.id, existingId)).run();
      }
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

// Reconstructs ParsedSms[] from the ledger's cached parsedResult JSON and
// runs the existing, already-tested deriveDashboard() over it — the exact
// same function apps/native/app/(drawer)/index.tsx already calls today, so
// this returns a bit-identical Dashboard shape, not a reimplementation of
// its reconciliation math (interval-based, sorted-history-dependent — real
// risk to reproduce incrementally without its own dedicated review pass).
// A row whose cached JSON fails to parse, or decodes to something that
// doesn't validate against the parser package's own MalanaResult schema
// (parsePersistedMalanaResult — the single source of truth for that
// contract, not a shape check reproduced here that could drift from it),
// is skipped rather than crashing — the same error-isolation principle
// ingestSmsBatch itself uses.
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
    const result = parsePersistedMalanaResult(decoded);
    if (!result) continue;
    messages.push({
      id: row.id,
      sender: row.sender,
      body: row.body,
      date: row.date,
      result,
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
