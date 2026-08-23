// Serializes every ledger-writing sync/backfill operation against every
// other one. Without this, an app-foreground syncInbox() and a user-
// triggered backfillSms() (or two syncInbox() calls from overlapping
// AppState events) can run concurrently: each individually still writes
// correctly (ingestSmsBatch's own transaction always rechecks state fresh
// — see its own comments), but their outer checkpoint-then-read sequences
// can interleave in ways that do real, avoidable extra native-inbox reads
// and parses, and make the two features' effects on each other harder to
// reason about than "one at a time." A single module-level queue is
// sufficient here — this app has one local SQLite connection, not
// multiple processes needing a cross-process lock.
let queue: Promise<unknown> = Promise.resolve();

// Runs `fn` only after every previously-queued call has settled
// (successfully or not) — chaining on the queue rather than replacing it
// outright is what prevents one call's failure from letting a later call
// jump ahead of an earlier one still queued behind it.
export function withIngestionLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn, fn);
  // Swallow the outcome here so one failure doesn't wedge every future
  // call behind a permanently-rejected queue — `result`, returned below,
  // still carries the real value or error to this specific caller.
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
