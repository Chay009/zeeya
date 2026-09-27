// Revision-consistent snapshot reads across multiple bounded queries against
// the normalized projection tables. A single query (or several queries
// wrapped in one SQL statement, like queryDashboardAggregates's own
// month-totals + category-totals UNION ALL) automatically reads one SQLite
// snapshot. Several separately-awaited queries do not: an atomic
// replaceProjection() publish can land between them, so accounts read at
// revision N could be combined with a transaction total read at revision
// N + 1 — the exact "accounts from revision N and totals from revision
// N + 1" case Step 5 warns against. This is the read-projection-revision,
// run-the-queries, re-read-the-revision, retry-if-it-changed pattern that
// closes that gap for any composed read spanning more than one query.
import { ensureProjectionReadable, getProjectionStatus } from "./ingestion";
import { isIngestionActive } from "./single-flight";

const MAX_SNAPSHOT_ATTEMPTS = 5;

// Runs `read` and guarantees every query it issued observed the same
// published, fully-caught-up projection revision — not merely "the
// projection happened to be stable across two revision reads." This
// wrapper owns freshness itself (calling ensureDashboardProjectionCurrent()
// once per attempt, before `before` is read) rather than delegating it to
// `read` — a `read` built by composing this module's own internal,
// ungated query helpers has no freshness guard of its own, and even a
// `read` built from already-freshness-gated public query functions would
// otherwise pay that lock/check cost once per child query instead of once
// per attempt here. Standalone public query functions (queryAccounts,
// queryTransactionPage, ...) keep their own ensureDashboardProjectionCurrent()
// call for callers that use them outside a composed snapshot read.
//
// ensureDashboardProjectionCurrent() alone isn't sufficient, though: it
// only serializes against writers active *at the moment it's called* — by
// the time this function reads `before`, a brand-new multi-page sync can
// already have advanced sourceRevision again without having published a
// projection for it yet (a multi-page sync deliberately leaves
// projectedRevision behind sourceRevision until its final page — see
// ensureDashboardProjectionCurrent's own comment). Both `before` and
// `after` could then report the exact same *stale* projectedRevision
// (sourceRevision ahead of it the whole time), which a bare
// projectedRevision-only comparison would wrongly accept as "unchanged
// and therefore fine." Requiring sourceRevision === projectedRevision on
// both reads, in addition to the projectedRevision match between them, is
// what actually enforces "this snapshot is the fully-caught-up
// projection," not just "revision-stable across two reads." A dirty
// `before` (sourceRevision ahead of projectedRevision right after
// ensureDashboardProjectionCurrent() returned) skips `read()` entirely and
// retries immediately — the next attempt's own
// ensureDashboardProjectionCurrent() call queues behind whatever writer is
// now active.
//
// Bounded retries, not an unbounded loop: a real device's sync cadence
// makes a same-request race exceedingly unlikely to repeat MAX_SNAPSHOT_
// ATTEMPTS times in a row, and an unbounded retry against a broken/looping
// publisher would hang a screen read forever instead of surfacing a real
// error.
//
// Exception — a writer is active (isIngestionActive): the source is ahead
// because a sync is mid-drain, not because a publish was lost. Readers then
// serve the last published revision (still one atomic, consistent snapshot)
// instead of queuing behind the whole sync; the writer's publish notifies
// db/data-changes.ts and screens re-read.
export async function readConsistentSnapshot<T>(read: () => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    attempt++;
    await ensureProjectionReadable();
    const before = await getProjectionStatus();
    if (before.sourceRevision !== before.projectedRevision && !isIngestionActive()) {
      if (attempt >= MAX_SNAPSHOT_ATTEMPTS) {
        throw new Error(
          `Projection is still catching up (source revision ${before.sourceRevision}, projected revision ${before.projectedRevision}) after ${MAX_SNAPSHOT_ATTEMPTS} consecutive attempts. Not returning a result read against a stale projection.`,
        );
      }
      continue;
    }
    const result = await read();
    const after = await getProjectionStatus();
    if (
      after.projectedRevision === before.projectedRevision &&
      (after.sourceRevision === after.projectedRevision || isIngestionActive())
    ) {
      return result;
    }
    if (attempt >= MAX_SNAPSHOT_ATTEMPTS) {
      throw new Error(
        `Projection changed during every one of ${MAX_SNAPSHOT_ATTEMPTS} consecutive snapshot-read attempts (last observed revision ${before.projectedRevision} -> ${after.projectedRevision}). Not returning a result that may span two different published revisions.`,
      );
    }
  }
}
