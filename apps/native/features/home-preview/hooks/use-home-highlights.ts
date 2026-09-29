import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import type { HomeHighlights, HomeHighlightsQuery } from "@/lib/dashboard-data";
import { localQueryKeys } from "@/lib/local-query-keys";
import { useLocalQuery, type LocalQueryStatus } from "@/lib/use-local-query";

export interface UseHomeHighlightsResult {
  status: LocalQueryStatus;
  error: string | null;
  highlights: HomeHighlights | null;
  reload: () => void;
}

export function useHomeHighlights(query: HomeHighlightsQuery): UseHomeHighlightsResult {
  const { data, status, error, reload } = useLocalQuery({
    queryKey: localQueryKeys.homeHighlights(query),
    queryFn: () => financeDataSource.home.loadHighlights({ ...query, at: Date.now() }),
  });
  return { status, error, highlights: data ?? null, reload };
}
