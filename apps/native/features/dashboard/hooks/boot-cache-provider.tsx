import { useEffect, useRef, type PropsWithChildren } from "react";

import { warmBootCache } from "@/lib/boot-cache";
import { useDashboardStore } from "@/stores/dashboard-store";

export function BootCacheProvider({ children }: PropsWithChildren) {
  const status = useDashboardStore((state) => state.status);
  const syncRevision = useDashboardStore((state) => state.syncRevision);
  const warmedRevision = useRef<number | null>(null);

  // Warm revision 0 immediately on mount so Home/Insights have data from
  // the previous session before the current sync completes.
  useEffect(() => {
    if (warmedRevision.current !== null) return;
    warmedRevision.current = 0;
    void warmBootCache(0);
  }, []);

  // Re-warm whenever a new sync revision lands so screens pick up fresh data.
  useEffect(() => {
    if (status !== "ready") return;
    if (syncRevision === 0) return;
    if (warmedRevision.current === syncRevision) return;
    warmedRevision.current = syncRevision;
    void warmBootCache(syncRevision);
  }, [status, syncRevision]);

  return children;
}
