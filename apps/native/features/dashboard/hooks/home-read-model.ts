// Fetches db/queries-home.ts's bounded HomeReadModel for one currency. Live
// via lib/live-queries.ts: a data change re-reads it in the background while
// the current model stays on screen.

import { useCallback } from "react";

import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import { localQueryKeys } from "@/lib/local-query-keys";
import { useLocalQuery } from "@/lib/use-local-query";

import type { HomeReadModelStatus, HomeReadModelState } from "./home-read-model-controller";

export type { HomeReadModelStatus, HomeReadModelState } from "./home-read-model-controller";

export interface UseHomeReadModelResult extends HomeReadModelState {
  reload: () => void;
}

export function loadHomeReadModel(currency: string) {
  return financeDataSource.home.load({ currency, at: Date.now() });
}

export function useHomeReadModel(currency: string): UseHomeReadModelResult {
  const { data, error, isInitialLoading, refetch } = useLocalQuery({
    queryKey: localQueryKeys.homeReadModel(currency),
    queryFn: () => loadHomeReadModel(currency),
  });

  const reload = useCallback(() => {
    void refetch();
  }, [refetch]);

  const status: HomeReadModelStatus = isInitialLoading ? "loading" : error && !data ? "error" : "ready";

  return {
    status,
    error: status === "error" ? error : null,
    model: data ?? null,
    currency,
    reload,
  };
}
