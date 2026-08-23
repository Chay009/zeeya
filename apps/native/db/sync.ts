// The checkpoint/read/ingest/reload sequence a screen needs to stay in
// sync with the device's SMS inbox — pulled out of the dashboard screen
// so it's unit-testable (a React Native screen file, which imports
// react-native transitively, can't be imported under Vitest at all — see
// lib/sms.ts's own module for why) and so any future caller (a background
// task, a settings screen's manual "sync now" button) gets the same
// correct sequence rather than re-implementing it.
import type { Dashboard } from "../lib/dashboard";
import type { RawSms } from "../lib/sms";
import { getSyncStatus, ingestSmsBatch, loadDashboard } from "./ingestion";

// Read from the checkpoint with a small backward overlap, not a strict
// `date > checkpoint` boundary: multiple messages can share one
// millisecond timestamp, and a strict boundary can miss one that arrived
// alongside the message the checkpoint actually recorded. The handful of
// already-ingested messages this re-fetches cost nothing extra —
// ingestSmsBatch recognizes them by fingerprint and never re-parses.
const SYNC_OVERLAP_MS = 60_000;

export type InboxOrder = "newest-first" | "oldest-first";

// Deliberately not react-native-get-sms-android's own filter shape (e.g. a
// raw `sortOrder: "date ASC"` string) — this interface is what makes
// syncInbox() and backfillSms() (db/backfill.ts, which reuses this same
// type) testable with a plain in-memory fake, decoupled from any native
// module or its SQL-ish filter syntax. `until` is unused by syncInbox
// itself (an open-ended "catch up to now" has no upper bound) but is part
// of the shared reader contract backfillSms needs.
export type InboxReader = (options: {
  since?: number;
  until?: number;
  order?: InboxOrder;
}) => Promise<RawSms[]>;

// Idempotent and safe to call from a mount effect, a pull-to-refresh, and
// an app-foreground listener alike — every call re-reads the checkpoint
// fresh, so overlapping/rapid calls only ever do redundant-but-harmless
// work (ingestSmsBatch's own idempotency), never lose or duplicate data.
export async function syncInbox(readInbox: InboxReader): Promise<Dashboard> {
  const checkpoint = await getSyncStatus();
  const hasCheckpoint = checkpoint.lastIngestedDate !== null;
  const since = hasCheckpoint ? checkpoint.lastIngestedDate! - SYNC_OVERLAP_MS : undefined;

  // Once there's a checkpoint to catch up from, read oldest-unsynced-first
  // rather than newest-first: readInbox's own maxCount cap means a backlog
  // larger than one page truncates somewhere, and newest-first truncation
  // would drop older (but still genuinely unsynced) messages while the
  // checkpoint still advances to the batch's true newest date — silently
  // and permanently skipping everything the truncation dropped. Oldest-
  // first instead makes each call a bounded, gapless step forward: the
  // checkpoint only ever advances to the newest message THIS call actually
  // ingested, so a backlog bigger than one page just takes multiple
  // syncInbox() calls to fully catch up, never a permanent gap.
  //
  // A first-ever sync (no checkpoint at all) keeps newest-first — there's
  // no "catching up without gaps" concern yet, and showing the most recent
  // activity first is the better initial experience. Reaching further back
  // than the first page is what the (separate, explicit) manual backfill
  // feature exists for.
  const raw = await readInbox({ since, order: hasCheckpoint ? "oldest-first" : "newest-first" });
  await ingestSmsBatch(raw);
  return loadDashboard();
}
