// Pure construction of the JSON filter object react-native-get-sms-android's
// SmsAndroid.list() expects — split out from lib/sms.ts specifically so it's
// unit-testable: lib/sms.ts imports react-native, which can't even be parsed
// under Vitest (Flow syntax in its own entry file — confirmed directly), so
// nothing in that file can be exercised by this test suite at all. This
// module imports nothing from react-native, so it can be.
//
// The one thing this split exists to actually protect: the `_id` secondary
// sort key (see sortOrderFor's own comment) is silent, easy to regress by
// simplifying back to a `date`-only ORDER BY, and its failure mode (equal-
// timestamp rows shuffling between paginated queries) can't be reproduced
// through the InboxReader test fakes elsewhere in this codebase — those
// model a single in-memory array with a JS `Array.prototype.sort`, which is
// always stable/deterministic regardless of what sortOrder string is
// requested, unlike a real ContentResolver.query() against Android's SMS
// content provider. A direct assertion on this function's own output is the
// only test that can actually catch that regression.
export type InboxOrder = "newest-first" | "oldest-first";

export interface InboxFilterOptions {
  maxCount?: number;
  since?: number;
  until?: number;
  indexFrom?: number;
  order?: InboxOrder;
}

export interface InboxFilter {
  box: "inbox";
  maxCount: number;
  minDate: number | undefined;
  maxDate: number | undefined;
  indexFrom: number | undefined;
  sortOrder: string;
}

// A `date`-only ORDER BY has no defined tiebreak among rows sharing one
// timestamp — separate ContentResolver.query() calls (each page is its own
// query, see db/inbox-pagination.ts) aren't guaranteed to return tied rows
// in the same relative order every time. Without a stable secondary key,
// equal-timestamp rows could shuffle between pages across two calls to this
// same paginated read, getting skipped or duplicated at a page boundary
// even though `indexFrom` itself is a real, correct offset. `_id` — the
// content provider's own unique row id — is stable and unique per message,
// so appending it as a secondary sort key makes the full ordering
// deterministic across repeated queries.
export function sortOrderFor(order: InboxOrder): string {
  return order === "newest-first" ? "date DESC, _id DESC" : "date ASC, _id ASC";
}

export function buildInboxFilter(options: InboxFilterOptions = {}): InboxFilter {
  return {
    box: "inbox",
    maxCount: options.maxCount ?? 5000,
    minDate: options.since,
    maxDate: options.until,
    indexFrom: options.indexFrom,
    sortOrder: sortOrderFor(options.order ?? "newest-first"),
  };
}
