import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import { DEFAULT_CURRENCY } from "@/lib/currency-preference";
import { localQueryKeys } from "@/lib/local-query-keys";
import { useLocalQuery, type LocalQueryStatus } from "@/lib/use-local-query";

export interface UseDashboardCurrenciesResult {
  status: LocalQueryStatus;
  error: string | null;
  currencies: string[];
  reload: () => void;
}

const EMPTY: string[] = [];

// Currencies with activity, cached (was re-read on every Analytics mount)
// and kept visible while a data change re-reads it.
export function useDashboardCurrencies(): UseDashboardCurrenciesResult {
  const { data, status, error, reload } = useLocalQuery({
    queryKey: localQueryKeys.dashboardCurrencies(),
    queryFn: () => financeDataSource.dashboard.listCurrencies(),
  });
  return { status, error, currencies: data ?? EMPTY, reload };
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
