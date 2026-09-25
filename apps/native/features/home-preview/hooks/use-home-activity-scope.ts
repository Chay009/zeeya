import { useEffect, useRef, useState } from "react";

import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";
import type { HomeActivityScopeSummary } from "@/lib/dashboard-data";

export type HomeActivityScopeStatus = "idle" | "loading" | "ready" | "error";

export function useHomeActivityScope(accountId: string | undefined): {
  status: HomeActivityScopeStatus;
  error: string | null;
  scope: HomeActivityScopeSummary | null;
} {
  const { syncRevision } = useDashboardSync();
  const [status, setStatus] = useState<HomeActivityScopeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<HomeActivityScopeSummary | null>(null);
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    if (!accountId) {
      setStatus("idle");
      setError(null);
      setScope(null);
      return;
    }

    let cancelled = false;
    const generation = ++requestGenerationRef.current;
    setStatus("loading");
    setError(null);

    void financeDataSource.home
      .loadActivityScope({ accountId })
      .then((nextScope) => {
        if (cancelled || generation !== requestGenerationRef.current) return;
        setScope(nextScope);
        setStatus("ready");
      })
      .catch((cause: unknown) => {
        if (cancelled || generation !== requestGenerationRef.current) return;
        setScope(null);
        setStatus("error");
        setError(cause instanceof Error ? cause.message : String(cause));
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, syncRevision]);

  return { status, error, scope };
}
