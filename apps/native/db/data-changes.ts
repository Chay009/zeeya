// Commit-level "local data changed" signal — the equivalent of Room's
// InvalidationTracker. Writers call notifyDataChanged() AFTER their
// transaction commits; readers (lib/live-queries.ts) re-read once per burst.
//
// Deliberately not expo-sqlite's addDatabaseChangeListener: SQLite's update
// hook fires per ROW, so one projection rebuild would push thousands of
// events across the native bridge. Every screen-visible write goes through
// a handful of functions (replaceProjection, updateLocalSettings), so a
// commit-level notification from those is both cheaper and exact.
//
// Notifications are coalesced: any number of calls in the same tick produce
// one callback, delivered on the next macrotask (never inside the writer's
// own call stack).

type Listener = () => void;

const listeners = new Set<Listener>();
let pending: ReturnType<typeof setTimeout> | null = null;

export function notifyDataChanged(): void {
  if (pending !== null) return;
  pending = setTimeout(() => {
    pending = null;
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (cause) {
        console.error("Zeeya data-change listener failed", cause);
      }
    }
  }, 0);
}

export function subscribeDataChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
