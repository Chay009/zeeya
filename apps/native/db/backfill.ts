// Manual historical backfill — reads a user-selected [from, to] date range
// from the device's SMS inbox and ingests it, independently of the
// automatic sync checkpoint (db/sync.ts's syncInbox). Two separate things
// guarantee the two features never interfere with each other:
//
//  1. ingestSmsBatch is called with { advanceCheckpoint: false } — a
//     backfill's job is to fill in older/missing history, not to move
//     "what's already covered going forward," which syncInbox owns
//     exclusively. Without this, a backfill range that happens to include
//     messages newer than the current checkpoint (e.g. an "All time" or
//     "Last 30 days" run before the very first automatic sync) would
//     silently advance it.
//
//  2. withIngestionLock (db/single-flight.ts) serializes this against any
//     concurrent syncInbox() call, so the two can't interleave.
import { drainInbox } from "./inbox-pagination";
import { ingestSmsBatch } from "./ingestion";
import { withIngestionLock } from "./single-flight";
import type { InboxReader } from "./sync";

export interface BackfillRange {
  from: number;
  to: number;
}

export interface BackfillResult {
  // Rows genuinely newly created by this run — not the number of messages
  // read (a backfill routinely re-scans already-ingested content, which
  // contributes nothing new). Sourced directly from ingestSmsBatch's own
  // IngestResult, not inferred from a before/after dashboard diff: an
  // indirect diff can't distinguish "this backfill inserted nothing" from
  // "something else changed the dashboard in between."
  //
  // Note this counts every newly-persisted ledger row, including ones
  // that failed to parse or didn't recognize as a financial transaction —
  // it is a count of *messages*, not of transactions. app/modal.tsx labels
  // it accordingly ("N new messages imported"), not as a transaction
  // count, which would need a separate, narrower count (dashboard.recent)
  // this doesn't compute.
  insertedCount: number;
}

// Real, position-based multi-page draining (see inbox-pagination.ts) over
// the explicit [from, to] range, rather than the earlier time-boundary
// approach that could silently stop early once messages were packed more
// tightly than its overlap window. Each page is ingested as it's fetched
// (see drainInbox/inbox-pagination.ts's own comment on why), not
// accumulated into one large in-memory array and one large transaction.
// `pageSize` is a test-only override — see syncInbox's own comment on why.
//
// Deliberately does NOT call loadDashboard() — callers that only need the
// insertedCount (app/modal.tsx) would otherwise pay to decode the entire
// ledger for a value they never use, and the dashboard screen itself
// already reloads on its own when navigation returns to it (see its
// useFocusEffect). A future caller that genuinely needs the post-backfill
// Dashboard can call loadDashboard() itself.
// `async` here specifically so an invalid `range` rejects the returned
// promise rather than throwing synchronously out of the call itself — a
// plain (non-async) function returning `withIngestionLock(...)` would
// otherwise throw before ever producing a promise for an early validation
// failure, forcing callers to handle this function's errors two different
// ways depending on which check failed.
export async function backfillSms(
  range: BackfillRange,
  readInbox: InboxReader,
  options: { pageSize?: number } = {},
): Promise<BackfillResult> {
  // Checked before ever touching withIngestionLock — none of these would
  // hang (readInbox would just get an already-nonsensical filter, or in
  // the inverted-range case, zero matching rows), but they'd silently do
  // nothing or misbehave while occupying the sync/backfill queue for no
  // reason, for a caller bug that's better rejected loudly and
  // immediately. NaN/Infinity in particular serialize into the native
  // filter's JSON as `null` (JSON.stringify(NaN) === "null"), which the
  // native module would then read via org.json's `opt`-style accessors —
  // not a crash, but a range boundary silently turning into "no boundary
  // at all" instead of the caller's actual (broken) intent.
  if (!Number.isSafeInteger(range.from) || !Number.isSafeInteger(range.to)) {
    throw new Error(
      `backfillSms: range.from/range.to must be finite safe integers, got from=${range.from}, to=${range.to}`,
    );
  }
  if (range.from > range.to) {
    throw new Error(`backfillSms: range.from (${range.from}) must be <= range.to (${range.to})`);
  }

  return withIngestionLock(async () => {
    const { inserted } = await drainInbox(
      readInbox,
      { since: range.from, until: range.to, order: "oldest-first", pageSize: options.pageSize },
      (page) => ingestSmsBatch(page, { advanceCheckpoint: false }),
    );
    return { insertedCount: inserted };
  });
}
