// The local-first ingestion/read interface (issue #17). Ledger + checkpoint
// only in this pass — see the header comment on loadDashboard for what's
// deliberately deferred to the next slice, and why.
import {
  createMalanaEngine,
  parsePersistedMalanaResult,
  PARSER_VERSION,
} from "@zeeya/parser/malana";
import { eq, inArray, sql } from "drizzle-orm";
import { deriveDashboard, type Dashboard } from "../lib/dashboard";
import type { ParsedSms, RawSms } from "../lib/sms";
import { db } from "./client";
import { identityConflicts, smsLedger, syncCheckpoint } from "./schema";
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

// ── Batch identity — group by content, then resolve provider-id ownership ───
//
// A row's identity is its fingerprint, full stop — see schema.ts's own
// comment on smsLedger.id for why that column IS the fingerprint rather
// than "provider id when we have one, else fingerprint." providerId below
// is a plain nullable attribute, free to move between rows via an
// ordinary UPDATE. That's what makes ownership below a genuine, symmetric
// contest (see planOwnership) instead of a fragile "whoever claimed it
// first, forever" rule.

interface ExistingRow {
  id: string; // == its fingerprint
  providerId: string | null;
  date: number;
}

interface PreparedMessage {
  message: RawSms;
  fingerprint: string;
  providerId: string | null;
}

// Every message in the batch sharing one fingerprint, after merging —
// content-identical by construction (fingerprint is a hash of
// sender|date|body), so any member is a valid representative. A group can
// carry more than one distinct claimed provider id when its own raw
// duplicates disagree (two on-device copies of the same content
// declaring different provider ids) — every one of those is preserved
// here rather than narrowed to a single "winner" before ownership is
// even considered, so a discarded candidate still reaches
// identityConflicts (see planOwnership) instead of vanishing silently.
interface ContentGroup {
  fingerprint: string;
  representative: RawSms;
  claimedProviderIds: readonly string[]; // sorted, deduplicated, possibly empty
}

function prepareMessage(message: RawSms): PreparedMessage {
  const body = message.body ?? "";
  const fingerprint = computeFingerprint(message.sender, message.date, body);
  return { message, fingerprint, providerId: message.id || null };
}

// Collapses every message in the batch sharing a fingerprint into one
// group — regardless of which order the caller happened to list them in.
// Two entries with the same fingerprint are the same underlying SMS
// content by construction, so there is exactly one row to resolve per
// fingerprint, not one decision per array position.
function groupByFingerprint(prepared: readonly PreparedMessage[]): ContentGroup[] {
  const byFingerprint = new Map<string, PreparedMessage[]>();
  for (const item of prepared) {
    const list = byFingerprint.get(item.fingerprint);
    if (list) list.push(item);
    else byFingerprint.set(item.fingerprint, [item]);
  }

  const groups: ContentGroup[] = [];
  for (const [fingerprint, items] of byFingerprint) {
    const claimedProviderIds = [
      ...new Set(items.map((i) => i.providerId).filter((id): id is string => id !== null)),
    ].sort();
    groups.push({ fingerprint, representative: items[0]!.message, claimedProviderIds });
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

// Every persisted row that could possibly matter to this batch: one whose
// id (fingerprint) matches one of ours, or whose providerId matches a
// value one of our groups claims. `date` is included specifically so an
// already-persisted row can be entered as a contender in the same
// ownership contest as this batch's own proposals (see planOwnership) —
// without it, a persisted row's claim to some provider id could only ever
// be treated as "first, forever," which is exactly the batch-partition-
// dependent behavior this model exists to remove.
function findExistingRows(
  queryable: Queryable,
  fingerprints: readonly string[],
  providerIds: readonly string[],
): { byId: Map<string, ExistingRow>; byProviderId: Map<string, ExistingRow> } {
  const byId = new Map<string, ExistingRow>();
  const byProviderId = new Map<string, ExistingRow>();

  function ingest(rows: readonly ExistingRow[]) {
    for (const row of rows) {
      byId.set(row.id, row);
      if (row.providerId) byProviderId.set(row.providerId, row);
    }
  }

  // Android's on-device SQLite (unlike the desktop build this suite tests
  // against — verified directly: better-sqlite3's bundled SQLite handled a
  // 3,000-item IN clause fine) has historically defaulted
  // SQLITE_MAX_VARIABLE_NUMBER to 999 to the whole statement, not per
  // clause — an earlier version of this function OR'd every chunked IN
  // clause together into one query, so a batch large enough to need
  // several chunks could still bind well past 999 params in that single
  // combined statement. Running each chunk as its own separate query (at
  // most EXISTENCE_CHECK_CHUNK_SIZE bound params apiece) is what actually
  // keeps every individual statement under the limit.
  for (const batch of chunk(fingerprints, EXISTENCE_CHECK_CHUNK_SIZE)) {
    if (batch.length === 0) continue;
    ingest(
      queryable
        .select({ id: smsLedger.id, providerId: smsLedger.providerId, date: smsLedger.date })
        .from(smsLedger)
        .where(inArray(smsLedger.id, batch))
        .all(),
    );
  }
  for (const batch of chunk(providerIds, EXISTENCE_CHECK_CHUNK_SIZE)) {
    if (batch.length === 0) continue;
    ingest(
      queryable
        .select({ id: smsLedger.id, providerId: smsLedger.providerId, date: smsLedger.date })
        .from(smsLedger)
        .where(inArray(smsLedger.providerId, batch))
        .all(),
    );
  }

  return { byId, byProviderId };
}

interface OwnershipPlan {
  // fingerprint -> providerId to store, for a row not yet in the ledger.
  insert: Map<string, string | null>;
  // fingerprint (of an EXISTING row) -> providerId to write — either a
  // fresh enrichment (existing was null) or an ownership transfer away
  // (existing was non-null, a better-ranked contender won it instead).
  updateProviderId: Map<string, string | null>;
  conflicts: { smsId: string; contestedProviderId: string }[];
  // Conflicts to mark resolved: a fingerprint that now genuinely holds
  // (or keeps holding) a provider id that was previously recorded as
  // contested against it.
  resolved: { smsId: string; contestedProviderId: string }[];
}

// The single ownership policy — used identically at preflight (to decide
// what needs parsing) and, from scratch against a fresh read, inside the
// transaction (the actual source of truth for what gets written). Pure:
// no I/O, so recomputing it twice is cheap and safe.
//
// Two layers of contest, run in sequence, and both required to be
// order-independent so final ownership never depends on how the same
// underlying messages happened to be partitioned across ingestSmsBatch()
// calls:
//
//  1. Intra-fingerprint: every provider id anyone has ever associated
//     with this exact content — this batch's own duplicate claims AND
//     whatever provider id the row already persists, if any — is pooled
//     together, and the lexicographically smallest one is this
//     fingerprint's canonical candidate. Same fingerprint means same
//     date (it's a hash of sender|date|body), so date can't rank these;
//     the pool + smallest-wins rule is what makes the outcome the same
//     whether the candidates all arrive in one batch, or one was already
//     persisted long before the others show up — including reassigning
//     the row away from its own already-persisted value if a smaller
//     candidate is pooled in later. Every pooled value except the
//     canonical one is recorded as a conflict against this fingerprint.
//
//  2. Cross-fingerprint: two *different* fingerprints (different content)
//     both wanting the same provider id is a genuine ownership question,
//     decided by one deterministic rule — newest representative date
//     wins, ties broken by the lexicographically smaller fingerprint —
//     applied uniformly across every contender for that value, whether
//     it's this batch's own candidate (from layer 1) or a different row
//     some earlier, unrelated call already persisted with that provider
//     id. A persisted incumbent can therefore lose ownership to a
//     later-arriving, higher-ranked contender (its providerId is cleared
//     and the loss recorded).
//
// Whichever fingerprint ends up winning a given provider id in layer 2
// has any previously-open conflict against it for that same id resolved
// — whether that's because it just won it, or because it already held it
// and this run simply reconfirms that.
function planOwnership(
  groups: readonly ContentGroup[],
  existing: { byId: Map<string, ExistingRow>; byProviderId: Map<string, ExistingRow> },
): OwnershipPlan {
  const insert = new Map<string, string | null>();
  const updateProviderId = new Map<string, string | null>();
  const conflicts: { smsId: string; contestedProviderId: string }[] = [];
  const resolved: { smsId: string; contestedProviderId: string }[] = [];

  interface GroupPlan {
    fingerprint: string;
    date: number;
    existingRow: ExistingRow | undefined;
    candidateProviderId: string | null;
  }
  const groupPlans: GroupPlan[] = [];

  // Layer 1 — intra-fingerprint pool.
  for (const g of groups) {
    const existingRow = existing.byId.get(g.fingerprint);
    const pool = new Set(g.claimedProviderIds);
    if (existingRow?.providerId) pool.add(existingRow.providerId);
    const sortedPool = [...pool].sort();
    const candidateProviderId = sortedPool[0] ?? null;
    for (const losing of sortedPool.slice(1)) {
      conflicts.push({ smsId: g.fingerprint, contestedProviderId: losing });
    }
    groupPlans.push({
      fingerprint: g.fingerprint,
      date: g.representative.date,
      existingRow,
      candidateProviderId,
    });
  }

  // Layer 2 — cross-fingerprint contest among each group's layer-1
  // candidate, plus any already-persisted row (outside this batch
  // entirely) currently holding that same provider id.
  interface Contender {
    fingerprint: string;
    date: number;
    external: boolean; // a persisted row whose fingerprint isn't in this batch at all
  }
  const contendersByProviderId = new Map<string, Contender[]>();
  for (const gp of groupPlans) {
    if (gp.candidateProviderId === null) continue;
    const list = contendersByProviderId.get(gp.candidateProviderId);
    const entry: Contender = { fingerprint: gp.fingerprint, date: gp.date, external: false };
    if (list) list.push(entry);
    else contendersByProviderId.set(gp.candidateProviderId, [entry]);
  }
  const batchFingerprints = new Set(groups.map((g) => g.fingerprint));
  for (const [providerId, list] of contendersByProviderId) {
    const currentOwner = existing.byProviderId.get(providerId);
    if (currentOwner && !batchFingerprints.has(currentOwner.id)) {
      list.push({ fingerprint: currentOwner.id, date: currentOwner.date, external: true });
    }
  }

  const winnerByProviderId = new Map<string, string>();
  for (const [providerId, contenders] of contendersByProviderId) {
    let winner = contenders[0]!;
    for (const c of contenders.slice(1)) {
      const better =
        c.date > winner.date || (c.date === winner.date && c.fingerprint < winner.fingerprint);
      if (better) winner = c;
    }
    winnerByProviderId.set(providerId, winner.fingerprint);
    for (const c of contenders) {
      if (c.fingerprint === winner.fingerprint) {
        resolved.push({ smsId: c.fingerprint, contestedProviderId: providerId });
      } else {
        conflicts.push({ smsId: c.fingerprint, contestedProviderId: providerId });
        if (c.external) updateProviderId.set(c.fingerprint, null); // ownership transferred away
      }
    }
  }

  for (const gp of groupPlans) {
    const finalProviderId =
      gp.candidateProviderId !== null &&
      winnerByProviderId.get(gp.candidateProviderId) === gp.fingerprint
        ? gp.candidateProviderId
        : null;
    if (gp.existingRow) {
      if (gp.existingRow.providerId !== finalProviderId)
        updateProviderId.set(gp.fingerprint, finalProviderId);
    } else {
      insert.set(gp.fingerprint, finalProviderId);
    }
  }

  return { insert, updateProviderId, conflicts, resolved };
}

// Parses one message into the content fields a ledger row needs —
// deliberately everything EXCEPT identity (id/providerId): which provider
// id (if any) a group's row ends up storing can only be finalized against
// the transaction's own recheck (see ingestSmsBatch), so baking it in
// here, before that recheck runs, would risk inserting an identity
// decision that's already stale by write time. Isolated per-message so
// one bad message (a parser throw) can't abort the whole batch.
function parseMessageContent(message: RawSms) {
  const storedBody = message.body ?? "";
  const base = {
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
// all call this the same way). A message already present by fingerprint is
// never re-parsed. This is what makes "restart does not require reparsing
// the entire inbox" (issue #17's acceptance criterion) actually true.
//
// If a row was first ingested with no provider id available and a later
// batch supplies one for that same fingerprint, the existing row is
// enriched with it — not re-parsed. If a provider id is contested between
// two different fingerprints (this batch's own messages, or one of them
// against an already-persisted row), planOwnership decides one canonical
// owner via a single deterministic rule and every other claimant is
// recorded in identityConflicts rather than silently dropped or silently
// preferred by arrival order — see planOwnership's own comment for the
// full policy.
//
// Flow: (1) group the incoming batch by fingerprint (groupByFingerprint);
// (2) a read-only preflight read of every potentially-relevant existing
// row (findExistingRows) feeds planOwnership, whose insert map says which
// fingerprints are genuinely new — those get parsed, yielding to the event
// loop after every PARSE_YIELD_EVERY actual parse calls (not merely every
// N loop iterations) so a large batch's parsing itself can't freeze the JS
// thread for its whole duration; (3) a short transaction re-reads current
// state and recomputes the *entire* plan from scratch against it — another
// call could have inserted, enriched, or transferred a provider id in the
// window since the preflight read, so nothing from the preflight plan is
// trusted for the actual writes — then applies every insert, every
// providerId update (enrichment or transfer-away), every conflict, every
// resolution, and conditionally advances the checkpoint, all in one
// transaction.
//
// That transaction body is a plain (non-async) function on purpose:
// drizzle's expo-sqlite transaction does NOT await its callback before
// committing (confirmed directly against its source — it calls the
// callback, then immediately runs COMMIT on the next line), so an async
// callback would commit before its own writes finished running. Since it
// contains no parsing, it stays fast regardless of batch size.
//
// `advanceCheckpoint` (default true) lets a caller ingest a batch without
// touching syncCheckpoint at all — db/backfill.ts sets this false: a
// manual historical backfill's job is to fill in older/missing history,
// not to move the "what's already covered going forward" boundary that
// db/sync.ts's syncInbox owns exclusively. Without this, backfilling any
// range that happens to include messages newer than the current
// checkpoint (e.g. an "All time" or "Last 30 days" backfill run before
// the very first automatic sync) would silently advance it — checkpoint
// semantics should only ever reflect what syncInbox itself has verified
// complete, never a manually-scoped operation with its own range bounds.
export async function ingestSmsBatch(
  messages: RawSms[],
  options: { advanceCheckpoint?: boolean } = {},
): Promise<void> {
  const database = requireDb();
  if (messages.length === 0) return;
  const advanceCheckpoint = options.advanceCheckpoint ?? true;

  const groups = groupByFingerprint(messages.map(prepareMessage));
  const fingerprints = groups.map((g) => g.fingerprint);
  const allClaimedProviderIds = [...new Set(groups.flatMap((g) => g.claimedProviderIds))];

  const preflight = findExistingRows(database, fingerprints, allClaimedProviderIds);
  const preflightPlan = planOwnership(groups, preflight);

  const contentByFingerprint = new Map<string, ReturnType<typeof parseMessageContent>>();
  let parseCallsSinceYield = 0;
  for (const [fingerprint] of preflightPlan.insert) {
    const group = groups.find((g) => g.fingerprint === fingerprint)!;
    contentByFingerprint.set(fingerprint, parseMessageContent(group.representative));
    if (++parseCallsSinceYield >= PARSE_YIELD_EVERY) {
      await yieldToEventLoop();
      parseCallsSinceYield = 0;
    }
  }

  // Derived from the maximum date across the raw, ungrouped messages, with
  // a deterministic tiebreak (lexicographically smallest provider id among
  // those tied for the max date) — purely informational (getSyncStatus),
  // not part of identity resolution, but still must not depend on array
  // order.
  const batchNewestDate = Math.max(...messages.map((m) => m.date));
  const batchNewestProviderId =
    messages
      .filter((m) => m.date === batchNewestDate)
      .map((m) => m.id || null)
      .filter((id): id is string => id !== null)
      .sort()[0] ?? null;

  database.transaction((tx) => {
    // The entire plan is recomputed from scratch against a fresh read,
    // not incrementally patched from the preflight one: another call
    // could have changed ownership of any provider id in the window since
    // the preflight read, so the preflight plan's insert/update decisions
    // cannot be trusted for the actual writes — only which fingerprints
    // needed parsing (already done, content cached above) survives from
    // that first pass.
    const recheck = findExistingRows(tx, fingerprints, allClaimedProviderIds);
    const plan = planOwnership(groups, recheck);

    // Every existing row whose providerId is changing has that value
    // cleared FIRST — unconditionally, whether its final value is null
    // (a straight release) or a different non-null id (a reassignment,
    // e.g. X: Z -> A) — before any insert or claim runs. A reassignment
    // still means the old value (Z) must be free for some OTHER row (Y)
    // to insert with, and Y's insert can run before X's own UPDATE to A
    // below; releasing only on providerId === null left Z still held by
    // X at the moment Y's insert ran, so Y's insert violated the unique
    // index and was silently dropped (no onConflictDoNothing() masking
    // it now — see the insert below).
    for (const [fingerprint] of plan.updateProviderId) {
      tx.update(smsLedger).set({ providerId: null }).where(eq(smsLedger.id, fingerprint)).run();
    }

    for (const [fingerprint, providerId] of plan.insert) {
      const content = contentByFingerprint.get(fingerprint);
      // Absent only if this fingerprint wasn't new at preflight time but
      // is new now — impossible, since existence is monotonic (rows are
      // never deleted mid-ingestion). Thrown, not silently skipped: a
      // silent `continue` here would advance the checkpoint past a
      // message that was never actually written, permanently losing it
      // from every future refresh's "already ingested" range.
      if (!content) {
        throw new Error(
          `ingestSmsBatch invariant violated: no parsed content cached for fingerprint ` +
            `${fingerprint}, which planOwnership scheduled for insert`,
        );
      }
      // No onConflictDoNothing(): every release this insert could
      // possibly depend on already ran above, and the whole transaction
      // callback is synchronous (no other writer can interleave), so a
      // unique-index violation here means planOwnership's own invariants
      // broke — better to roll back the transaction loudly than silently
      // drop the SMS this row represents.
      tx.insert(smsLedger)
        .values({ id: fingerprint, providerId, ...content })
        .run();
    }

    for (const [fingerprint, providerId] of plan.updateProviderId) {
      if (providerId !== null) {
        tx.update(smsLedger).set({ providerId }).where(eq(smsLedger.id, fingerprint)).run();
      }
    }

    // One row per detected conflict, not an update onto smsLedger itself —
    // see identityConflicts's own comment for why a single nullable column
    // there couldn't represent this. onConflictDoNothing() against the
    // partial unique index (open contests only) makes re-recording the
    // same still-open contest a no-op rather than a duplicate row.
    if (plan.conflicts.length > 0) {
      const detectedAt = Date.now();
      for (const batch of chunk(plan.conflicts, EXISTENCE_CHECK_CHUNK_SIZE)) {
        tx.insert(identityConflicts)
          .values(batch.map((c) => ({ ...c, detectedAt })))
          .onConflictDoNothing()
          .run();
      }
    }

    // Marks a previously-open conflict resolved when the fingerprint it
    // was recorded against now genuinely holds that same provider id —
    // either because it just won a contest for it, or because it always
    // held it and a re-run of the contest confirmed that. A no-op when no
    // matching open row exists.
    for (const { smsId, contestedProviderId } of plan.resolved) {
      tx.update(identityConflicts)
        .set({ resolvedAt: Date.now() })
        .where(
          sql`${identityConflicts.smsId} = ${smsId} AND ${identityConflicts.contestedProviderId} = ${contestedProviderId} AND ${identityConflicts.resolvedAt} IS NULL`,
        )
        .run();
    }

    // A single conditional upsert, not read-then-write: two overlapping
    // batches (e.g. a foreground refresh and a background catch-up) can no
    // longer race, because the "only if newer" check and the write happen
    // in one SQL statement rather than a separate SELECT the caller then
    // acts on. On a tied date (two batches reporting the same newest
    // timestamp), the provider id also converges deterministically —
    // preferring a non-null id over null, and the lexicographically
    // smaller of two non-null ids — rather than keeping whichever batch
    // happened to write the checkpoint first.
    //
    // Skipped entirely when advanceCheckpoint is false — not just left
    // unadvanced, since the INSERT branch alone would still create the
    // "inbox" row from nothing on a database with no checkpoint yet,
    // which is itself an advance (null -> some date) a caller explicitly
    // asked not to make.
    if (advanceCheckpoint) {
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
          where: sql`
            ${syncCheckpoint.lastIngestedDate} IS NULL
            OR ${syncCheckpoint.lastIngestedDate} < ${batchNewestDate}
            OR (
              ${syncCheckpoint.lastIngestedDate} = ${batchNewestDate}
              AND (
                (${syncCheckpoint.lastIngestedProviderId} IS NULL AND ${batchNewestProviderId} IS NOT NULL)
                OR (
                  ${syncCheckpoint.lastIngestedProviderId} IS NOT NULL
                  AND ${batchNewestProviderId} IS NOT NULL
                  AND ${batchNewestProviderId} < ${syncCheckpoint.lastIngestedProviderId}
                )
              )
            )
          `,
        })
        .run();
    }
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
