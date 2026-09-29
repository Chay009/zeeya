// Fetches db/queries-home.ts's bounded HomeReadModel for one currency. Live
// via lib/live-queries.ts: a data change re-reads it in the background while
// the current model stays on screen.

import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import type { HomeReadModel } from "@/lib/dashboard-data";
import { localQueryKeys } from "@/lib/local-query-keys";
import { useLocalQuery, type LocalQueryStatus } from "@/lib/use-local-query";

export interface UseHomeReadModelResult {
  status: LocalQueryStatus;
  error: string | null;
  model: HomeReadModel | null;
  currency: string;
  reload: () => void;
}

export function loadHomeReadModel(currency: string) {
  return financeDataSource.home.load({ currency, at: Date.now() });
}

export function useHomeReadModel(currency: string): UseHomeReadModelResult {
  const { data, status, error, reload } = useLocalQuery({
    queryKey: localQueryKeys.homeReadModel(currency),
    queryFn: () => loadHomeReadModel(currency),
  });
  return { status, error, model: data ?? null, currency, reload };
}
