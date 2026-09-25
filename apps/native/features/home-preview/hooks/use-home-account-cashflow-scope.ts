import { useEffect, useRef, useState } from "react";

import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";
import type { HomeAccountCashflowScope } from "@/lib/dashboard-data";

export type HomeAccountCashflowScopeStatus = "idle" | "loading" | "ready" | "error";

export function useHomeAccountCashflowScope(
  accountId: string | undefined,
  currency: string,
  at: number,
): {
  status: HomeAccountCashflowScopeStatus;
  error: string | null;
  scope: HomeAccountCashflowScope | null;
} {
  const { syncRevision } = useDashboardSync();
  const [status, setStatus] = useState<HomeAccountCashflowScopeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<HomeAccountCashflowScope | null>(null);
  const [scopeAccountId, setScopeAccountId] = useState<string | null>(null);
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    if (!accountId) {
      setStatus("idle");
      setError(null);
      setScope(null);
      setScopeAccountId(null);
      return;
    }

    let cancelled = false;
    const generation = ++requestGenerationRef.current;
    setStatus("loading");
    setError(null);
    // Keep the last scoped snapshot visible while a refresh is in flight.

    void financeDataSource.home
      .loadAccountCashflowScope({ accountId, currency, at })
      .then((nextScope) => {
        if (cancelled || generation !== requestGenerationRef.current) return;
        setScope(nextScope);
        setScopeAccountId(accountId);
        setStatus("ready");
      })
      .catch((cause: unknown) => {
        if (cancelled || generation !== requestGenerationRef.current) return;
        setScope(null);
        setScopeAccountId(null);
        setStatus("error");
        setError(cause instanceof Error ? cause.message : String(cause));
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, at, currency, syncRevision]);

  return {
    status,
    error,
    scope: scopeAccountId === accountId ? scope : null,
  };
}
