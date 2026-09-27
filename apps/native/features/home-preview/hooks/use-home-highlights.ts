import { useCallback } from "react";

import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import type { HomeHighlightsQuery } from "@/lib/dashboard-data";
import { localQueryKeys } from "@/lib/local-query-keys";
import { useLocalQuery } from "@/lib/use-local-query";

import type { HomeHighlightsState, HomeHighlightsStatus } from "./home-highlights-controller";

export type { HomeHighlightsStatus, HomeHighlightsState } from "./home-highlights-controller";

export interface UseHomeHighlightsResult extends HomeHighlightsState {
  reload: () => void;
}

export function useHomeHighlights(query: HomeHighlightsQuery): UseHomeHighlightsResult {

  const { data, error, isInitialLoading, refetch } = useLocalQuery({
    queryKey: localQueryKeys.homeHighlights(query),
    queryFn: () => financeDataSource.home.loadHighlights({ ...query, at: Date.now() }),
  });

  const reload = useCallback(() => {
    void refetch();
  }, [refetch]);

  const status: HomeHighlightsStatus = isInitialLoading ? "loading" : error ? "error" : "ready";

  return {
    status,
    error,
    highlights: data ?? null,
    currency: query.currency,
    at: query.at,
    accountId: query.accountId,
    reload,
  };
}
