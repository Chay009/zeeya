// Real, position-based multi-page draining over an InboxReader — shared by
// db/sync.ts (catching up to now) and db/backfill.ts (a bounded [from, to]
// range), both of which can need more than one reader page to cover fully.
//
// An earlier version of this pagination advanced the *time* boundary
// itself between pages (moving `since` forward to the previous page's
// newest date, minus a small overlap). That broke whenever messages were
// packed more tightly than the overlap window (a burst of same- or
// near-timestamp messages larger than one page): the next page's read,
// bounded by the same shifted-back `since`, could return the *exact same*
// rows again — sorting is stable and the underlying data hadn't changed —
// so the loop detected "no forward progress" and stopped, silently
// abandoning everything past that point. Genuine offset-based pagination
// via the native module's own `indexFrom` (confirmed against its Java
// source: a position counter over the since/until-filtered result set,
// applied before maxCount truncation) has no such failure mode — it walks
// the filtered result set by position, not by time, so it's correct
// regardless of how many messages share a timestamp, PROVIDED the
// underlying query orders those tied rows deterministically across
// separate calls — see lib/sms.ts's readSmsInbox for why its sortOrder
// includes `_id` as a secondary key, not just `date`.
//
// Pages are ingested as they're fetched (onPage), not accumulated into one
// big array first: a backfill over a large inbox could otherwise hold the
// whole history in memory, and ingest it as a single very large
// transaction, for the entire duration this runs under
// db/single-flight.ts's lock.
import type { RawSms } from "../lib/sms";
import type { IngestResult } from "./ingestion";
import type { InboxOrder, InboxReader } from "./sync";

const DEFAULT_PAGE_SIZE = 1000;

export interface DrainOptions {
  since?: number;
  until?: number;
  order: InboxOrder;
  pageSize?: number;
}

// Exported so callers that accept a `pageSize` option but don't always
// route it through drainInbox (db/sync.ts's first-ever-sync path reads a
// single unpaginated page, bypassing drainInbox entirely) can still
// validate it consistently at their own boundary, rather than a bad
// pageSize being silently ignored on some code paths and only rejected on
// others.
export function validatePageSize(pageSize: number): void {
  // A pageSize <= 0 (or non-integer) breaks drainInbox's two loop
  // termination conditions at once: the real native reader ignores a
  // non-positive maxCount and returns everything unbounded (confirmed
  // against its Java source: `if (maxCount > 0 && ...)` never fires for
  // maxCount <= 0), so `page.length < pageSize` can never be true, AND
  // `indexFrom += pageSize` never advances — an infinite loop that
  // re-fetches the same unbounded result forever. Rejected up front
  // rather than left to manifest as a hang with no useful error.
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error(`pageSize must be a positive integer, got ${pageSize}`);
  }
}

// Ascending-order (oldest-first) pagination is safe against the inbox
// growing mid-drain: a real Android SMS inbox only ever appends newer
// messages, which sort *after* everything already paged through in an
// ASC view, so earlier pages' positions never shift underneath this loop.
// This helper is only ever used with order: "oldest-first" by both
// callers — see their own comments for why a single, unpaginated
// newest-first read is deliberately sufficient for the one case that
// still uses that order (a first-ever sync).
export async function drainInbox(
  readInbox: InboxReader,
  options: DrainOptions,
  onPage: (page: RawSms[]) => Promise<IngestResult>,
): Promise<IngestResult> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  validatePageSize(pageSize);
  // indexFrom itself isn't a caller-exposed parameter anywhere in this
  // module's public surface — it's entirely derived below, starting at 0
  // and advancing only by the pageSize just validated above — so
  // validating pageSize is what guarantees indexFrom stays a nonnegative
  // integer throughout, without a separate check needed for it directly.
  let indexFrom = 0;
  let inserted = 0;

  while (true) {
    const page = await readInbox({
      since: options.since,
      until: options.until,
      order: options.order,
      indexFrom,
      maxCount: pageSize,
    });
    if (page.length > 0) {
      const result = await onPage(page);
      inserted += result.inserted;
    }
    if (page.length < pageSize) break; // fewer than a full page — reached the end
    indexFrom += pageSize;
  }

  return { inserted };
}
