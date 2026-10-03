import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import { localQueryKeys } from "@/lib/local-query-keys";
import { EMPTY_MESSAGE_INSIGHTS, type MessageInsights } from "@/lib/message-insights";
import { useLocalQuery, type LocalQueryStatus } from "@/lib/use-local-query";

export interface UseMessageInsightsResult {
  status: LocalQueryStatus;
  insights: MessageInsights;
  reload: () => void;
}

/**
 * Bills due, card limits, cashback, trips, deliveries, NAVs, data packs and
 * the payment mix for one currency. Live: a sync or the day rolling over
 * re-reads it (the query reads the clock itself). Empty until loaded, so a
 * screen simply shows no insight cards rather than a loading state.
 */
export function useMessageInsights(currency: string): UseMessageInsightsResult {
  const { data, status, reload } = useLocalQuery({
    queryKey: localQueryKeys.messageInsights(currency),
    queryFn: () => financeDataSource.insights.loadMessageInsights({ currency, at: Date.now() }),
  });
  return { status, insights: data ?? EMPTY_MESSAGE_INSIGHTS, reload };
}
