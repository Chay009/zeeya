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
import type { Dashboard } from "../lib/dashboard";
import { drainInbox } from "./inbox-pagination";
import { ingestSmsBatch, loadDashboard } from "./ingestion";
import { withIngestionLock } from "./single-flight";
import type { InboxReader } from "./sync";

export interface BackfillRange {
  from: number;
  to: number;
}

// Real, position-based multi-page draining (see inbox-pagination.ts) over
// the explicit [from, to] range, rather than the earlier time-boundary
// approach that could silently stop early once messages were packed more
// tightly than its overlap window. `pageSize` is a test-only override —
// see syncInbox's own comment on why.
export function backfillSms(
  range: BackfillRange,
  readInbox: InboxReader,
  options: { pageSize?: number } = {},
): Promise<Dashboard> {
  return withIngestionLock(async () => {
    const raw = await drainInbox(readInbox, {
      since: range.from,
      until: range.to,
      order: "oldest-first",
      pageSize: options.pageSize,
    });
    await ingestSmsBatch(raw, { advanceCheckpoint: false });
    return loadDashboard();
  });
}
