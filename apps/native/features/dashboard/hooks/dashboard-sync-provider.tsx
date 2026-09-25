import { useEffect, type PropsWithChildren } from "react";
import * as SplashScreen from "expo-splash-screen";

import { BootCacheProvider } from "@/features/dashboard/hooks/boot-cache-provider";
import { useDashboardStore } from "@/stores/dashboard-store";

export type { DashboardSyncStatus as Status } from "@/stores/dashboard-store";

export function DashboardSyncProvider({ children }: PropsWithChildren) {
  const status = useDashboardStore((state) => state.status);

  useEffect(() => {
    // DatabaseProvider holds this child back until the database is ready, so
    // syncing can't start before migrations finish.
    return useDashboardStore.getState().start();
  }, []);

  useEffect(() => {
    if (status !== "checking" && status !== "loading") {
      void SplashScreen.hideAsync();
    }
  }, [status]);
  return <BootCacheProvider>{children}</BootCacheProvider>;
}

export function useDashboardSync() {
  return useDashboardStore();
}
