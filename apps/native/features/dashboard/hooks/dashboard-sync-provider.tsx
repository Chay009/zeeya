import { useEffect, type PropsWithChildren } from "react";
import * as SplashScreen from "expo-splash-screen";

import { useShallow } from "zustand/react/shallow";

import { warmBootCache } from "@/lib/boot-cache";
import { useDashboardStore, type DashboardStoreState } from "@/stores/dashboard-store";

export type { DashboardSyncStatus as Status } from "@/stores/dashboard-store";

export function DashboardSyncProvider({ children }: PropsWithChildren) {
  // Mount-only lifecycle (DatabaseProvider holds this child back until the
  // database is ready, so neither step can run before migrations finish):
  //  - start the inbox sync in the background — it never blocks the UI;
  //    its publish re-reads open screens via lib/live-queries.ts.
  //  - hide the splash as soon as the first screens' local data is cached,
  //    not when the sync finishes. Reads don't queue behind a sync (see
  //    db/ingestion.ts ensureProjectionReadable), so this is one quick read.
  useEffect(() => {
    const stop = useDashboardStore.getState().start();
    void warmBootCache().finally(() => SplashScreen.hideAsync());
    return stop;
  }, []);

  return children;
}

/**
 * Sync state for a screen. Pass a selector naming exactly what the
 * component renders — it re-renders only when those fields change (shallow
 * compare, so returning an object of fields is fine). A selector-less call
 * subscribes to the whole store, including per-page sync progress; only the
 * dev screens still do that.
 */
export function useDashboardSync(): DashboardStoreState;
export function useDashboardSync<T>(selector: (state: DashboardStoreState) => T): T;
export function useDashboardSync(selector?: (state: DashboardStoreState) => unknown) {
  return useDashboardStore(useShallow(selector ?? selectAll));
}

const selectAll = (state: DashboardStoreState) => state;
