import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import type { InsightsOverview, InsightsOverviewQuery } from "@/lib/dashboard-data";
import { localQueryKeys } from "@/lib/local-query-keys";
import { useLocalQuery, type LocalQueryStatus } from "@/lib/use-local-query";

export interface UseInsightsOverviewResult {
  status: LocalQueryStatus;
  error: string | null;
  overview: InsightsOverview | null;
  reload: () => void;
}

export function useInsightsOverview(query: InsightsOverviewQuery): UseInsightsOverviewResult {
  const { data, status, error, reload } = useLocalQuery({
    queryKey: localQueryKeys.insightsOverview(query),
    queryFn: () => financeDataSource.insights.loadOverview({ ...query, at: Date.now() }),
    keepPrevious: false,
  });
  return { status, error, overview: data ?? null, reload };
}
