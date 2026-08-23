// The checkpoint/read/ingest/reload sequence a screen needs to stay in
// sync with the device's SMS inbox — pulled out of the dashboard screen
// so it's unit-testable (a React Native screen file, which imports
// react-native transitively, can't be imported under Vitest at all — see
// lib/sms.ts's own module for why) and so any future caller (a background
// task, a settings screen's manual "sync now" button) gets the same
// correct sequence rather than re-implementing it.
import type { Dashboard } from "../lib/dashboard";
import type { RawSms } from "../lib/sms";
import { drainInbox } from "./inbox-pagination";
import { getSyncStatus, ingestSmsBatch, loadDashboard } from "./ingestion";
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

export type InboxOrder = "newest-first" | "oldest-first";

// Deliberately not react-native-get-sms-android's own filter shape (e.g. a
// raw `sortOrder: "date ASC"` string) — this interface is what makes
// syncInbox() and backfillSms() (db/backfill.ts, which reuses this same
// type) testable with a plain in-memory fake, decoupled from any native
// module or its SQL-ish filter syntax. `until`/`indexFrom`/`maxCount` are
// unused by a first-ever sync (an open-ended "catch up to now" has no
// upper bound and isn't paginated — see below) but are part of the shared
// reader contract both syncInbox's own catch-up path and backfillSms need.
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
// boundary without constructing thousands of rows.
export function syncInbox(
  readInbox: InboxReader,
  options: { pageSize?: number } = {},
): Promise<Dashboard> {
  if (inFlightSync) return inFlightSync;

  const promise = withIngestionLock(async () => {
    const checkpoint = await getSyncStatus();
    const hasCheckpoint = checkpoint.lastIngestedDate !== null;

    if (hasCheckpoint) {
      // Real, position-based multi-page draining (see inbox-pagination.ts
      // for why this replaced an earlier time-boundary-based approach that
      // could silently stop early on tightly-packed messages), ingesting
      // each page as it's fetched rather than buffering the whole catch-up
      // in memory first — this call fully catches up to "now" in one
      // syncInbox() invocation, not just one bounded page per call.
      const since = checkpoint.lastIngestedDate! - SYNC_OVERLAP_MS;
      await drainInbox(
        readInbox,
        { since, order: "oldest-first", pageSize: options.pageSize },
        (page) => ingestSmsBatch(page),
      );
    } else {
      // A first-ever sync (no checkpoint at all) reads one bounded,
      // newest-first page rather than draining everything: there's no
      // "catching up without gaps" concern yet (nothing has been marked
      // synced to fall behind), and showing the most recent activity
      // first is the better initial experience. Reaching further back
      // than that first page is what the separate, explicit manual
      // backfill feature (db/backfill.ts) exists for.
      const raw = await readInbox({ order: "newest-first" });
      await ingestSmsBatch(raw);
    }

    return loadDashboard();
  }).finally(() => {
    inFlightSync = null;
  });

  inFlightSync = promise;
  return promise;
}
