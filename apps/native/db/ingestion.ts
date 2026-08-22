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

// ── Batch identity — group, resolve ownership, then decide what's new ──────

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
// message that shares that exact fingerprint (see groupByFingerprint).
// Fingerprint equality means content-identical by construction (it's a
// hash of sender|date|body), so any member of the group is a valid
// representative — there is no order-dependence to resolve here. What its
// provider id *should* be, when more than one same-fingerprint duplicate
// (or a different-fingerprint group elsewhere in the batch) carries a
// non-null provider id, is decided separately in
// resolveBatchProviderIdOwnership below.
interface FingerprintGroup {
  fingerprint: string;
  providerId: string | null;
  representative: RawSms;
}

// A FingerprintGroup after batch-local provider-id ownership has been
// resolved (see resolveBatchProviderIdOwnership) — the unit ingestSmsBatch
// actually operates on downstream of this point.
interface ResolvedGroup {
  fingerprint: string;
  providerId: string | null;
  contestedProviderId: string | null;
  rowId: string;
  representative: RawSms;
}

function prepareMessage(message: RawSms): PreparedMessage {
  const body = message.body ?? "";
  const fingerprint = computeFingerprint(message.sender, message.date, body);
  return { message, fingerprint, providerId: message.id || null };
}

// Collapses every message in the batch sharing a fingerprint into one
// group — regardless of which order the caller happened to list them in.
// Two entries with the same fingerprint are the same underlying SMS
// content by construction, so there is exactly one identity to resolve
// per fingerprint, not one decision per array position: picking
// "whichever one appears first in the input array" (a previous, buggy
// approach) meant a batch of [no-provider-id copy, provider-id copy]
// silently discarded the provider id, while the reverse order kept it —
// the same two messages producing two different outcomes depending on
// array order is not a real identity rule. Sorting candidate provider ids
// and taking the lexicographically smallest is: if more than one message
// in the batch legitimately carries a different non-null provider id for
// the same content (a real duplicate SMS row on-device), some
// deterministic tiebreak is required, and any fixed one works equally
// well since which of two real provider ids "owns" the row is not
// otherwise distinguishable — the important property is that it doesn't
// depend on input order.
//
// Deliberately does NOT merge across different fingerprints even when
// they share a provider id — that was tried and was wrong: two entries
// with *different* fingerprints are, by construction, different content,
// and forcing them into one group meant picking a single representative
// whose body/sender/date didn't necessarily match the group's own
// (independently, lexicographically chosen) stored fingerprint — an
// internally inconsistent row — and meant one of the two messages'
// content was discarded outright with no record. Cross-fingerprint
// provider-id contention is a real thing (see
// resolveBatchProviderIdOwnership) but it's an ownership question, not a
// content-merging one: each fingerprint keeps its own row.
function groupByFingerprint(prepared: readonly PreparedMessage[]): FingerprintGroup[] {
  const byFingerprint = new Map<string, PreparedMessage[]>();
  for (const item of prepared) {
    const list = byFingerprint.get(item.fingerprint);
    if (list) list.push(item);
    else byFingerprint.set(item.fingerprint, [item]);
  }

  const groups: FingerprintGroup[] = [];
  for (const [fingerprint, items] of byFingerprint) {
    const providerIds = items
      .map((i) => i.providerId)
      .filter((id): id is string => id !== null)
      .sort();
    groups.push({
      fingerprint,
      providerId: providerIds[0] ?? null,
      representative: items[0]!.message,
    });
  }
  return groups;
}

// Resolves which fingerprint group gets to claim a provider id that more
// than one group in this batch carries — this is the case a same-batch
// union-merge previously tried (wrongly) to paper over by collapsing both
// groups into one row. The provider_id column is unique, so at most one
// row can actually hold a contested id; the other group's content is
// still inserted (as its own row, keyed by its own fingerprint), just
// without that provider id, and with contestedProviderId recorded so the
// collision leaves a trace instead of vanishing.
//
// The tiebreak (newest representative date; ties broken by
// lexicographically smallest fingerprint) is a pure function of the
// group's own content, not of array position, so two batches containing
// the same contenders in any order resolve to the same winner — "max by a
// total order" doesn't care which order it's folded over.
function resolveBatchProviderIdOwnership(groups: readonly FingerprintGroup[]): ResolvedGroup[] {
  const claimants = new Map<string, FingerprintGroup[]>();
  for (const g of groups) {
    if (g.providerId === null) continue;
    const list = claimants.get(g.providerId);
    if (list) list.push(g);
    else claimants.set(g.providerId, [g]);
  }

  const winnerFingerprintByProviderId = new Map<string, string>();
  for (const [providerId, contenders] of claimants) {
    let winner = contenders[0]!;
    for (const g of contenders.slice(1)) {
      const isNewer = g.representative.date > winner.representative.date;
      const isTiedButLexicallySmaller =
        g.representative.date === winner.representative.date && g.fingerprint < winner.fingerprint;
      if (isNewer || isTiedButLexicallySmaller) winner = g;
    }
    winnerFingerprintByProviderId.set(providerId, winner.fingerprint);
  }

  return groups.map((g) => {
    if (g.providerId === null) {
      return {
        fingerprint: g.fingerprint,
        providerId: null,
        contestedProviderId: null,
        rowId: g.fingerprint,
        representative: g.representative,
      };
    }
    if (winnerFingerprintByProviderId.get(g.providerId) === g.fingerprint) {
      return {
        fingerprint: g.fingerprint,
        providerId: g.providerId,
        contestedProviderId: null,
        rowId: g.providerId,
        representative: g.representative,
      };
    }
    // Lost in-batch contention for this provider id.
    return {
      fingerprint: g.fingerprint,
      providerId: null,
      contestedProviderId: g.providerId,
      rowId: g.fingerprint,
      representative: g.representative,
    };
  });
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
  groups: readonly Pick<ResolvedGroup, "rowId" | "fingerprint" | "providerId">[],
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

// What to do with one group, given the identities already on disk (either
// the preflight snapshot or a transactional recheck of it).
type GroupOutcome =
  | { kind: "exists"; existingId: string }
  | { kind: "exists-enrich"; existingId: string; providerId: string }
  | { kind: "exists-conflict"; existingId: string; contestedProviderId: string }
  | { kind: "insert" };

// A group's content can match an existing row two independent ways: by
// fingerprint (the strongest signal — content-derived, not caller-
// supplied) and by provider id (if the group claims a non-null one).
// Those normally agree, but don't have to: if the fingerprint belongs to
// row A while the provider id belongs to a *different* row B (B already
// legitimately owns it — enriched by an earlier, unrelated batch), that's
// a genuine identity conflict. Blindly enriching A with B's provider id
// would throw on the unique index and roll back the whole transaction;
// this instead recognizes A as the existing row for this content and
// records the conflict rather than attempting the corrupting write.
//
// If there's no existing row for this exact fingerprint yet, but the
// provider id already belongs to one, that provider id's owner is treated
// as this content's real row (a locked design decision from an earlier
// review round: a provider id is a stronger, more durable identity than a
// fingerprint that can shift when the OS hands back corrected metadata
// for what is otherwise the same underlying message) — no new row, no
// reparse.
function decideGroupOutcome(
  group: Pick<ResolvedGroup, "fingerprint" | "providerId">,
  identities: ExistingIdentities,
): GroupOutcome {
  const existingByFingerprint = identities.byFingerprint.get(group.fingerprint);
  const existingByProviderId = group.providerId
    ? identities.byProviderId.get(group.providerId)
    : undefined;

  if (existingByFingerprint) {
    if (group.providerId && !existingByFingerprint.providerId) {
      if (existingByProviderId && existingByProviderId.id !== existingByFingerprint.id) {
        return {
          kind: "exists-conflict",
          existingId: existingByFingerprint.id,
          contestedProviderId: group.providerId,
        };
      }
      return {
        kind: "exists-enrich",
        existingId: existingByFingerprint.id,
        providerId: group.providerId,
      };
    }
    return { kind: "exists", existingId: existingByFingerprint.id };
  }

  if (group.providerId && existingByProviderId) {
    return { kind: "exists", existingId: existingByProviderId.id };
  }

  return { kind: "insert" };
}

// Parses one message and shapes it into the ledger row this batch will
// insert — isolated per-message so one bad message (a parser throw) can't
// abort the whole batch.
function buildLedgerRow(group: ResolvedGroup) {
  const message = group.representative;
  const storedBody = message.body ?? "";
  const base = {
    id: group.rowId,
    fingerprint: group.fingerprint,
    providerId: group.providerId,
    contestedProviderId: group.contestedProviderId,
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
// Flow: (1) group the incoming batch by fingerprint (groupByFingerprint)
// and resolve which group gets to claim a provider id more than one group
// claims (resolveBatchProviderIdOwnership — deterministic, order-
// independent; the loser is still inserted, just without that provider id
// and with the conflict recorded); (2) a read-only preflight existence
// check, no transaction; (3) parse only genuinely-new groups, yielding to
// the event loop after every PARSE_YIELD_EVERY actual parse calls (not
// merely every N loop iterations) so a large batch's parsing itself can't
// freeze the JS thread for its whole duration; (4) a short transaction
// that rechecks insertions, enrichments, AND proposed provider-id
// ownership against current state — another call could have inserted,
// enriched, or claimed a provider id in the window since the preflight
// read — applies enrichments only where both the target row's providerId
// is still null AND the proposed provider id isn't now owned by a
// different row, inserts rows, records any conflicts, and conditionally
// advances the checkpoint.
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

  const groups = resolveBatchProviderIdOwnership(groupByFingerprint(messages.map(prepareMessage)));
  const preflight = findExistingIdentities(database, groups);

  const toInsertGroups: ResolvedGroup[] = [];
  const toEnrich = new Map<string, string>(); // existing row id -> provider id to set
  const toRecordConflict = new Map<string, string>(); // existing row id -> contested provider id

  for (const group of groups) {
    const outcome = decideGroupOutcome(group, preflight);
    if (outcome.kind === "exists-enrich") toEnrich.set(outcome.existingId, outcome.providerId);
    else if (outcome.kind === "exists-conflict")
      toRecordConflict.set(outcome.existingId, outcome.contestedProviderId);
    else if (outcome.kind === "insert") toInsertGroups.push(group);
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

  // Derived from the maximum date across the raw, ungrouped messages —
  // deliberately not from any per-group representative. A representative
  // is picked per fingerprint for storage purposes, but which fingerprint
  // group happens to contain "the" newest raw message is exactly the kind
  // of incidental, structure-dependent fact this purely-informational
  // checkpoint field must not depend on. Ties at the max date are broken
  // lexicographically by provider id, not by array position, so this is
  // order-independent the same way the ledger's own identity resolution is.
  const batchNewestDate = Math.max(...messages.map((m) => m.date));
  const batchNewestProviderId =
    messages
      .filter((m) => m.date === batchNewestDate)
      .map((m) => m.id || null)
      .filter((id): id is string => id !== null)
      .sort()[0] ?? null;

  database.transaction((tx) => {
    // Recheck insertions against current state rather than trusting the
    // preflight snapshot: another ingestSmsBatch call could have inserted
    // some of these rows in the window between the preflight read and this
    // transaction opening.
    const recheck = findExistingIdentities(tx, toInsertGroups);
    for (let i = 0; i < toInsertGroups.length; i++) {
      const group = toInsertGroups[i]!;
      const row = rowsToInsert[i]!;
      const outcome = decideGroupOutcome(group, recheck);
      if (outcome.kind === "exists-enrich") toEnrich.set(outcome.existingId, outcome.providerId);
      else if (outcome.kind === "exists-conflict")
        toRecordConflict.set(outcome.existingId, outcome.contestedProviderId);
      else if (outcome.kind === "insert")
        tx.insert(smsLedger).values(row).onConflictDoNothing().run();
    }

    // Enrichment candidates from the preflight are revalidated here too,
    // not just applied blindly: another call could have enriched the
    // target row, or claimed the proposed provider id for a *different*
    // row, in that same window. Both are checked immediately before the
    // write — the exact race that previously reached the unique index
    // itself and threw, rolling back the whole batch — so a genuine
    // conflict is recorded instead of attempted.
    if (toEnrich.size > 0) {
      const enrichIds = [...toEnrich.keys()];
      const proposedProviderIds = [...new Set(toEnrich.values())];

      const currentProviderIdByRowId = new Map<string, string | null>();
      for (const batch of chunk(enrichIds, EXISTENCE_CHECK_CHUNK_SIZE)) {
        for (const row of tx
          .select({ id: smsLedger.id, providerId: smsLedger.providerId })
          .from(smsLedger)
          .where(inArray(smsLedger.id, batch))
          .all()) {
          currentProviderIdByRowId.set(row.id, row.providerId);
        }
      }

      const ownerRowIdByProviderId = new Map<string, string>();
      for (const batch of chunk(proposedProviderIds, EXISTENCE_CHECK_CHUNK_SIZE)) {
        for (const row of tx
          .select({ id: smsLedger.id, providerId: smsLedger.providerId })
          .from(smsLedger)
          .where(inArray(smsLedger.providerId, batch))
          .all()) {
          if (row.providerId) ownerRowIdByProviderId.set(row.providerId, row.id);
        }
      }

      for (const [existingId, providerId] of toEnrich) {
        if (currentProviderIdByRowId.get(existingId) !== null) continue;
        const currentOwner = ownerRowIdByProviderId.get(providerId);
        if (currentOwner && currentOwner !== existingId) {
          toRecordConflict.set(existingId, providerId);
          continue;
        }
        tx.update(smsLedger).set({ providerId }).where(eq(smsLedger.id, existingId)).run();
      }
    }

    // Persist every detected identity conflict onto the row it was
    // detected against, rather than letting it disappear once the batch
    // otherwise succeeds — a collision is signal (corrected/duplicated
    // provider metadata, or a genuine data anomaly worth surfacing), not
    // something ingestion should quietly absorb.
    for (const [existingId, contestedProviderId] of toRecordConflict) {
      tx.update(smsLedger).set({ contestedProviderId }).where(eq(smsLedger.id, existingId)).run();
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
