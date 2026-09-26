import { useCallback } from "react";

import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";
import { localQueryKeys } from "@/lib/local-query-keys";
import { useLocalQuery } from "@/lib/use-local-query";

import type { DashboardCurrenciesState } from "./dashboard-currencies-controller";

export type {
  DashboardCurrenciesState,
  DashboardCurrenciesStatus,
} from "./dashboard-currencies-controller";

export interface UseDashboardCurrenciesResult extends DashboardCurrenciesState {
  reload: () => void;
}

const EMPTY: string[] = [];

// Currencies with activity, cached per sync revision (was re-read on every
// Analytics mount). The last list stays visible while a new revision loads.
export function useDashboardCurrencies(): UseDashboardCurrenciesResult {
  const { syncRevision } = useDashboardSync();
  const { data, error, isInitialLoading, refetch } = useLocalQuery({
    queryKey: localQueryKeys.dashboardCurrencies(syncRevision),
    queryFn: () => financeDataSource.dashboard.listCurrencies(),
  });
  const reload = useCallback(() => {
    void refetch();
  }, [refetch]);

  const status = isInitialLoading ? "loading" : error && !data ? "error" : "ready";
  return { status, error: status === "error" ? error : null, currencies: data ?? EMPTY, reload };
}
