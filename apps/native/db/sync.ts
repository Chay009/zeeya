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

// Idempotent and safe to call from a mount effect, a pull-to-refresh, and
// an app-foreground listener alike — every call re-reads the checkpoint
// fresh, so overlapping/rapid calls only ever do redundant-but-harmless
// work (ingestSmsBatch's own idempotency), never lose or duplicate data.
// withIngestionLock also means truly concurrent calls (including a
// concurrent backfillSms()) never actually interleave — each one's full
// checkpoint-read-ingest sequence runs to completion before the next
// starts.
// `pageSize` is a test-only override of inbox-pagination.ts's default
// page size — real callers never need it (the default is sized for real
// device usage), but tests exercising the multi-page path with a handful
// of fixture messages need a much smaller page to actually cross a page
// boundary without constructing thousands of rows.
export function syncInbox(
  readInbox: InboxReader,
  options: { pageSize?: number } = {},
): Promise<Dashboard> {
  return withIngestionLock(async () => {
    const checkpoint = await getSyncStatus();
    const hasCheckpoint = checkpoint.lastIngestedDate !== null;

    let raw: RawSms[];
    if (hasCheckpoint) {
      // Real, position-based multi-page draining (see inbox-pagination.ts
      // for why this replaced an earlier time-boundary-based approach that
      // could silently stop early on tightly-packed messages) — this call
      // fully catches up to "now" in one syncInbox() invocation, not just
      // one bounded page per call.
      const since = checkpoint.lastIngestedDate! - SYNC_OVERLAP_MS;
      raw = await drainInbox(readInbox, {
        since,
        order: "oldest-first",
        pageSize: options.pageSize,
      });
    } else {
      // A first-ever sync (no checkpoint at all) reads one bounded,
      // newest-first page rather than draining everything: there's no
      // "catching up without gaps" concern yet (nothing has been marked
      // synced to fall behind), and showing the most recent activity
      // first is the better initial experience. Reaching further back
      // than that first page is what the separate, explicit manual
      // backfill feature (db/backfill.ts) exists for.
      raw = await readInbox({ order: "newest-first" });
    }

    await ingestSmsBatch(raw);
    return loadDashboard();
  });
}
