// Manual historical backfill — reads a user-selected [from, to] date range
// from the device's SMS inbox and ingests it, independently of the
// automatic sync checkpoint (db/sync.ts's syncInbox): a backfill covering
// only old history never advances the checkpoint (ingestSmsBatch's own
// "only if newer" checkpoint upsert already guarantees that), so the two
// features can't interfere with each other.
import type { Dashboard } from "../lib/dashboard";
import { ingestSmsBatch, loadDashboard } from "./ingestion";
import type { InboxReader } from "./sync";

export interface BackfillRange {
  from: number;
  to: number;
}

// Same reasoning as syncInbox's SYNC_OVERLAP_MS: successive pages overlap
// by this much rather than starting strictly after the previous page's
// last message, so a message sharing that exact millisecond timestamp
// (and therefore possibly sorted after it, ordering among same-timestamp
// rows being unspecified) is never skipped at a page boundary.
const BACKFILL_OVERLAP_MS = 60_000;

// A single call to readInbox is bounded by its own maxCount (see
// lib/sms.ts), so a range wider than one page needs repeated, oldest-
// first calls to cover fully — the same gaplessness concern syncInbox
// solves for the open-ended "catch up to now" case, applied here to an
// explicit, bounded [from, to] range instead. Each iteration only ever
// advances the read window forward (to the previous page's newest date,
// minus the overlap), so a page smaller than the remaining range just
// means more iterations, never a skipped message.
export async function backfillSms(
  range: BackfillRange,
  readInbox: InboxReader,
): Promise<Dashboard> {
  let since = range.from;
  let lastMax = -Infinity;

  while (true) {
    const page = await readInbox({ since, until: range.to, order: "oldest-first" });
    if (page.length === 0) break;

    await ingestSmsBatch(page);

    const pageMax = Math.max(...page.map((m) => m.date));
    // No forward progress from the overlap alone (every message in this
    // page was already covered by the previous one) — stop rather than
    // loop forever re-fetching the same page.
    if (pageMax <= lastMax) break;
    lastMax = pageMax;

    if (pageMax >= range.to) break;
    since = pageMax - BACKFILL_OVERLAP_MS;
  }

  return loadDashboard();
}
