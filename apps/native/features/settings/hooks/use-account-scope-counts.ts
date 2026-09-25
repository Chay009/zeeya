import { useCallback, useEffect, useRef, useState } from "react";

import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";
import type { AccountScopeCounts } from "@/lib/dashboard-data";

export type AccountScopeCountsStatus = "loading" | "ready" | "error";

export interface AccountScopeCountsState extends AccountScopeCounts {
  status: AccountScopeCountsStatus;
  error: string | null;
}

export function useAccountScopeCounts(): AccountScopeCountsState & { reload: () => void } {
  const { syncRevision } = useDashboardSync();
  const [state, setState] = useState<AccountScopeCountsState>({
    status: "loading",
    error: null,
    confirmedCount: 0,
    detectedCount: 0,
  });
  const requestGenerationRef = useRef(0);

  const load = useCallback(async () => {
    const generation = ++requestGenerationRef.current;
    setState((previous) => ({ ...previous, status: "loading", error: null }));
    try {
      const counts = await financeDataSource.accounts.scopeCounts();
      if (generation !== requestGenerationRef.current) return;
      setState({ status: "ready", error: null, ...counts });
    } catch (cause: unknown) {
      if (generation !== requestGenerationRef.current) return;
      setState({
        status: "error",
        error: cause instanceof Error ? cause.message : String(cause),
        confirmedCount: 0,
        detectedCount: 0,
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, syncRevision]);

  return { ...state, reload: load };
}
