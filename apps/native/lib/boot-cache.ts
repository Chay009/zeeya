import { HOME_RECENT_ACTIVITY_MAX_LIMIT } from "@/db/queries-home";
import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import { loadSubscriptionsCatalog } from "@/features/home-preview/hooks/use-subscriptions-catalog";
import {
  INSIGHTS_RECENT_TRANSACTIONS_LIMIT,
  loadRecentInsightsTransactions,
} from "@/features/insights/hooks/use-insights-recent-transactions";

import { rememberedPrimaryCurrency } from "./currency-preference";
import { localQueryKeys } from "./local-query-keys";
import { queryClient } from "./query-client";
import { syncAnchor } from "./sync-anchor";

const forever = Number.POSITIVE_INFINITY;

/**
 * Prefetch what the first screens render so every tab opens on cached data.
 * Keys MUST match the screens exactly — same `at` (the shared sync anchor),
 * same query shape — or the prefetch is wasted work.
 */
export async function warmBootCache(
  syncRevision: number,
  currency = rememberedPrimaryCurrency(),
): Promise<void> {
  const at = syncAnchor(syncRevision);
  const overviewQuery = { currency, at };
  const highlightsQuery = { currency, at, accountId: undefined };
  const transactionsScope = { limit: HOME_RECENT_ACTIVITY_MAX_LIMIT };

  // Tier 1 — Home's first paint, then the other tabs' headline data.
  await Promise.allSettled([
    queryClient.prefetchQuery({
      queryKey: localQueryKeys.homeReadModel(currency, syncRevision),
      queryFn: () => financeDataSource.home.load({ currency, at }),
      staleTime: forever,
    }),
    queryClient.prefetchQuery({
      queryKey: localQueryKeys.homeHighlights(highlightsQuery, syncRevision),
      queryFn: () => financeDataSource.home.loadHighlights(highlightsQuery),
      staleTime: forever,
    }),
    queryClient.prefetchQuery({
      queryKey: localQueryKeys.recentActivity(transactionsScope, syncRevision),
      queryFn: () => financeDataSource.home.loadRecentActivity({ ...transactionsScope, at: Date.now() }),
      staleTime: forever,
    }),
    queryClient.prefetchQuery({
      queryKey: localQueryKeys.dashboardCurrencies(syncRevision),
      queryFn: () => financeDataSource.dashboard.listCurrencies(),
      staleTime: forever,
    }),
    queryClient.prefetchQuery({
      queryKey: localQueryKeys.insightsOverview(overviewQuery, syncRevision),
      queryFn: () => financeDataSource.insights.loadOverview(overviewQuery),
      staleTime: forever,
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
      staleTime: forever,
    }),
  ]);

  // Tier 2 — heavier, opened less often; warmed after the tabs are ready so
  // it never competes with first paint.
  await queryClient
    .prefetchQuery({
      queryKey: localQueryKeys.subscriptionsCatalog(syncRevision),
      queryFn: loadSubscriptionsCatalog,
      staleTime: forever,
    })
    .catch(() => undefined);
}
