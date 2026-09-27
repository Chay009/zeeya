import { useCallback } from "react";

import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import type { InsightsOverviewQuery } from "@/lib/dashboard-data";
import { localQueryKeys } from "@/lib/local-query-keys";
import { useLocalQuery } from "@/lib/use-local-query";

import type {
  InsightsOverviewState,
  InsightsOverviewStatus,
} from "./insights-overview-controller";

export type { InsightsOverviewStatus, InsightsOverviewState } from "./insights-overview-controller";

export interface UseInsightsOverviewResult extends InsightsOverviewState {
  reload: () => void;
}

export function useInsightsOverview(query: InsightsOverviewQuery): UseInsightsOverviewResult {

  const { data, error, isInitialLoading, refetch } = useLocalQuery({
    queryKey: localQueryKeys.insightsOverview(query),
    queryFn: () => financeDataSource.insights.loadOverview({ ...query, at: Date.now() }),
  });

  const reload = useCallback(() => {
    void refetch();
  }, [refetch]);

  const status: InsightsOverviewStatus = isInitialLoading ? "loading" : error ? "error" : "ready";

  return {
    status,
    error,
    overview: data ?? null,
    currency: query.currency,
    at: query.at,
    reload,
  };
}
