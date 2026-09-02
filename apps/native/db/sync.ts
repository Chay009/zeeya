// The checkpoint/read/ingest/reload sequence a screen needs to stay in
// sync with the device's SMS inbox — pulled out of the dashboard screen
// so it's unit-testable (a React Native screen file, which imports
// react-native transitively, can't be imported under Vitest at all — see
// lib/sms.ts's own module for why) and so any future caller (a background
// task, a settings screen's manual "sync now" button) gets the same
// correct sequence rather than re-implementing it.
import type { Dashboard } from "../lib/dashboard";
import type { RawSms } from "../lib/sms";
import type { InboxOrder } from "../lib/sms-filter";
import { drainInbox, validatePageSize } from "./inbox-pagination";
import {
  getSyncStatus,
  ingestSmsBatch,
  loadDashboard,
  markInitialScanCompleted,
} from "./ingestion";
import { withIngestionLock } from "./single-flight";

// Read from the checkpoint with a small backward overlap, not a strict
// `date > checkpoint` boundary: multiple messages can share one
// millisecond timestamp, and a strict boundary can miss one that arrived
// alongside the message the checkpoint actually recorded. This overlap
// only ever affects which messages are *included* in the read (a handful
// of already-ingested ones re-fetched harmlessly, since ingestSmsBatch
// recognizes them by fingerprint) — it plays no role in pagination itself,
// which is real offset-based paging (see inbox-pagination.ts) immune to
// how tightly messages are packed together.
const SYNC_OVERLAP_MS = 60_000;

// The product-defined scope of the initial historical scan (see
// markInitialScanCompleted's own comment): the last 90 days, not the
// user's entire SMS history. Anything older is what the separate, explicit
// manual backfill screen (db/backfill.ts) exists for.
const INITIAL_SCAN_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

// Reported after every page ingested during a sync, not just once at the
// end — scanned/inserted counts, not a percentage: the total size of what
// still needs to be read isn't known upfront (the native reader has no
// cheap COUNT), and a fabricated percentage would be more misleading than
// no percentage at all. `dashboard` is the freshly recomputed state after
// this page, so a caller can render real, growing numbers as a sync
// proceeds instead of only once the whole call resolves.
export interface SyncProgress {
  scanned: number;
  inserted: number;
  dashboard: Dashboard;
}

// InboxOrder itself lives in lib/sms-filter.ts (re-exported here) — that's
// where buildInboxFilter() also uses it to construct the real native
// filter's sortOrder, so there is exactly one definition rather than two
// independently-maintained copies that could drift apart.
export type { InboxOrder };

// Deliberately not react-native-get-sms-android's own filter shape (e.g. a
// raw `sortOrder: "date ASC"` string) — this interface is what makes
// syncInbox() and backfillSms() (db/backfill.ts, which reuses this same
// type) testable with a plain in-memory fake, decoupled from any native
// module or its SQL-ish filter syntax.
export type InboxReader = (options: {
  since?: number;
  until?: number;
  order?: InboxOrder;
  indexFrom?: number;
  maxCount?: number;
}) => Promise<RawSms[]>;

// True single-flight, not just mutual exclusion: while a sync is already
// running, a second concurrent call reuses that SAME in-flight promise
// instead of queuing up a brand new, fully redundant sync behind it (which
// withIngestionLock's mutex alone would do — it prevents two syncs from
// running at the *same time*, but not from each doing the full work
// sequentially). Several syncInbox() calls arriving close together — e.g.
// overlapping AppState events, or a foreground resume racing a pull-to-
// refresh — all legitimately want "the inbox is caught up," and one
// execution satisfies all of them identically. Reset to null once the
// in-flight call settles (success or failure), so a later, genuinely
// separate call still triggers a fresh sync.
//
// Known, currently-harmless gap: this coalesces purely on "is a sync
// already running," ignoring whether a concurrent call passed a different
// `readInbox`/`pageSize`. Production only ever calls this with one real
// reader (lib/sms.ts's readSmsInbox) and no pageSize override, so that
// mismatch can't actually occur today — but if a future caller ever needs
// a second, meaningfully different concurrent reader, this would silently
// reuse the first call's result for it instead of running the second.
let inFlightSync: Promise<Dashboard> | null = null;

// `pageSize` is a test-only override of inbox-pagination.ts's default
// page size — real callers never need it (the default is sized for real
// device usage), but tests exercising the multi-page path with a handful
// of fixture messages need a much smaller page to actually cross a page
// boundary without constructing thousands of rows. `now` is likewise a
// test-only override of Date.now(), needed because the initial-scan
// window below is computed relative to "now."
export function syncInbox(
  readInbox: InboxReader,
  options: { pageSize?: number; onProgress?: (progress: SyncProgress) => void; now?: number } = {},
): Promise<Dashboard> {
  if (inFlightSync) return inFlightSync;

  const promise = withIngestionLock(async () => {
    // Validated here, unconditionally, rather than only where drainInbox
    // happens to be reached — every branch below now routes through
    // drainInbox, but validating up front keeps the error the same
    // regardless of which branch would have reached it first.
    if (options.pageSize !== undefined) validatePageSize(options.pageSize);

    let scanned = 0;
    let inserted = 0;
    const onPage = async (page: RawSms[]) => {
      const result = await ingestSmsBatch(page);
      scanned += page.length;
      inserted += result.inserted;
      if (options.onProgress) {
        options.onProgress({ scanned, inserted, dashboard: await loadDashboard() });
      }
      return result;
    };

    const checkpoint = await getSyncStatus();

    if (checkpoint.initialScanCompletedAt === null) {
      // First-ever sync: bounded to the last 90 days (the product's
      // "Historical SMS Scan" scope), paginated like any other drain
      // instead of one unbounded blocking read — see SyncProgress's own
      // comment for why. `until` is pinned to this scan's own start time,
      // not left open-ended, so a message arriving *during* a long scan
      // can't shift what position-based pagination is walking over out
      // from under it; the sweep immediately below picks up anything that
      // arrived in that gap.
      const now = options.now ?? Date.now();
      const since = now - INITIAL_SCAN_WINDOW_MS;
      await drainInbox(
        readInbox,
        { since, until: now, order: "oldest-first", pageSize: options.pageSize },
        onPage,
      );
      // Recorded regardless of whether the scan found anything — see
      // markInitialScanCompleted's own comment on why this must be
      // independent of lastIngestedDate.
      await markInitialScanCompleted(now);
      // Sweeps up anything that arrived between `now` (the scan's own
      // `until`) and this instant, so it isn't stranded until the next
      // unrelated trigger (foreground resume, a later SMS) happens to
      // run a catch-up sync.
      await drainInbox(
        readInbox,
        { since: now, order: "oldest-first", pageSize: options.pageSize },
        onPage,
      );
    } else {
      // Routine catch-up: from the last verified point forward. Falls
      // back to when the initial scan completed if lastIngestedDate is
      // still null (the 90-day window was genuinely empty) — there's no
      // ingested message to anchor to yet, but there's also no need to
      // look earlier than the scan itself already covered.
      const anchor = checkpoint.lastIngestedDate ?? checkpoint.initialScanCompletedAt;
      const since = anchor - SYNC_OVERLAP_MS;
      await drainInbox(
        readInbox,
        { since, order: "oldest-first", pageSize: options.pageSize },
        onPage,
      );
    }

    return loadDashboard();
  }).finally(() => {
    inFlightSync = null;
  });

  inFlightSync = promise;
  return promise;
}
