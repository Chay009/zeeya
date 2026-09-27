import { useCallback } from "react";

import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import { DEFAULT_CURRENCY } from "@/lib/currency-preference";
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

// Currencies with activity, cached (was re-read on every Analytics mount)
// and kept visible while a data change re-reads it.
export function useDashboardCurrencies(): UseDashboardCurrenciesResult {
  const { data, error, isInitialLoading, refetch } = useLocalQuery({
    queryKey: localQueryKeys.dashboardCurrencies(),
    queryFn: () => financeDataSource.dashboard.listCurrencies(),
  });
  const reload = useCallback(() => {
    void refetch();
  }, [refetch]);

  const status = isInitialLoading ? "loading" : error && !data ? "error" : "ready";
  return { status, error: status === "error" ? error : null, currencies: data ?? EMPTY, reload };
}

/**
 * The product primary currency — the SQL ordering puts it first (INR when
 * present, else the most recent account's). Every screen that reads the Home
 * read model keys it by this, so they all share one cache entry, and it is
 * known before Home renders (the boot cache reads it first).
 */
export function usePrimaryCurrency(): string {
  return useDashboardCurrencies().currencies[0] ?? DEFAULT_CURRENCY;
}
