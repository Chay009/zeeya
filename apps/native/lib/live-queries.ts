import type { QueryClient } from "@tanstack/react-query";

import { subscribeDataChanged } from "@/db/data-changes";

import { subscribeDayChanged } from "./today";

// Makes every on-device read live, the way Room's Flow-returning DAOs are:
// local query keys describe only WHAT is read (currency, scope, id), never a
// revision or timestamp, and this module re-reads them when the answer can
// have changed —
//  - a write committed (db/data-changes.ts: projection publish, settings),
//  - the calendar day rolled over ("this month" moved).
//
// invalidateQueries refetches mounted queries in the background (their
// current data stays on screen) and marks the rest stale, so they re-read on
// their next mount while showing cached data — never a skeleton.

export const LOCAL_QUERY_ROOT = ["local"] as const;

export function connectLiveQueries(client: QueryClient): () => void {
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: LOCAL_QUERY_ROOT });
  };
  const offData = subscribeDataChanged(invalidate);
  const offDay = subscribeDayChanged(invalidate);
  return () => {
    offData();
    offDay();
  };
}
