import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import {
  INSIGHTS_RECENT_TRANSACTIONS_LIMIT,
  loadRecentInsightsTransactions,
} from "@/features/insights/hooks/use-insights-recent-transactions";

import { localQueryKeys } from "./local-query-keys";
import { queryClient } from "./query-client";

/**
 * Prefetch the screens users open first so tab switches feel instant.
 * Called once after the first successful dashboard sync.
 */
export async function warmBootCache(syncRevision: number, currency = "INR"): Promise<void> {
  const at = Date.now();
  const overviewQuery = { currency, at };

  await Promise.allSettled([
    queryClient.prefetchQuery({
      queryKey: localQueryKeys.homeReadModel(currency, syncRevision),
      queryFn: () => financeDataSource.home.load({ currency, at }),
      staleTime: Number.POSITIVE_INFINITY,
    }),
    queryClient.prefetchQuery({
      queryKey: localQueryKeys.insightsOverview(overviewQuery, syncRevision),
      queryFn: () => financeDataSource.insights.loadOverview(overviewQuery),
      staleTime: Number.POSITIVE_INFINITY,
    }),
    queryClient.prefetchQuery({
      queryKey: localQueryKeys.recentTransactions(
        "expense",
        currency,
        INSIGHTS_RECENT_TRANSACTIONS_LIMIT,
        syncRevision,
      ),
      queryFn: () =>
        loadRecentInsightsTransactions({
          direction: "expense",
          currency,
          limit: INSIGHTS_RECENT_TRANSACTIONS_LIMIT,
        }),
      staleTime: Number.POSITIVE_INFINITY,
    }),
  ]);
}
