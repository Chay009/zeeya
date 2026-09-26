import { useMemo } from "react";

// One "as of" timestamp per projection revision, shared by every screen and
// by the boot cache. Local queries take an `at` (what "today"/"this month"
// mean) and it is part of their cache key — if each screen captured its own
// Date.now() on mount, every mount would be a new key, a cache miss, and a
// fresh SQLCipher read, and boot-cache prefetches would never be hit.
//
// The anchor only moves when the data does (a new sync revision) or when the
// calendar day rolls over, so "today" never goes stale.

let anchor: { revision: number; at: number } | null = null;

function sameDay(left: number, right: number): boolean {
  const a = new Date(left);
  const b = new Date(right);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function syncAnchor(revision: number): number {
  const now = Date.now();
  if (!anchor || anchor.revision !== revision || !sameDay(anchor.at, now)) {
    anchor = { revision, at: now };
  }
  return anchor.at;
}

export function useSyncAnchor(revision: number): number {
  return useMemo(() => syncAnchor(revision), [revision]);
}
