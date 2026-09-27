import { HOME_RECENT_ACTIVITY_MAX_LIMIT } from "@/db/queries-home";
import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import { loadHomeReadModel } from "@/features/dashboard/hooks/home-read-model";
import { loadSubscriptionsCatalog } from "@/features/home-preview/hooks/use-subscriptions-catalog";
import { elapsedDaysInCurrentMonth } from "@/features/insights/analytics-scope";
import {
  INSIGHTS_RECENT_TRANSACTIONS_LIMIT,
  loadRecentInsightsTransactions,
} from "@/features/insights/hooks/use-insights-recent-transactions";
import { querySpendingSeries } from "@/features/insights/insights-data";

import { DEFAULT_CURRENCY } from "./currency-preference";
import { localQueryKeys } from "./local-query-keys";
import { queryClient } from "./query-client";

const forever = Number.POSITIVE_INFINITY;

/**
 * Read what the first screens render into the query cache, once, at launch,
 * so every tab opens on data. Keys MUST match the screens' hooks exactly or
 * the prefetch is wasted work. After this, lib/live-queries.ts keeps the
 * cache current — there is no per-sync re-warm.
 *
 * Resolves when tier 1 (the tabs' first paint) is cached, so the splash can
 * hide on it; tier 2 continues in the background.
 */
export async function warmBootCache(): Promise<void> {
  // The currency list first: its head is the primary currency every screen
  // keys its reads by (usePrimaryCurrency), so Home's first render already
  // asks for the right currency — never INR-then-reload.
  const currencies = await queryClient
    .fetchQuery({
      queryKey: localQueryKeys.dashboardCurrencies(),
      queryFn: () => financeDataSource.dashboard.listCurrencies(),
      staleTime: forever,
    })
    .catch((): string[] => []);
  const currency = currencies[0] ?? DEFAULT_CURRENCY;
  const overviewQuery = { currency };
  const highlightsQuery = { currency, accountId: undefined };
  const transactionsScope = { limit: HOME_RECENT_ACTIVITY_MAX_LIMIT };

  await Promise.allSettled([
    queryClient.prefetchQuery({
      queryKey: localQueryKeys.homeReadModel(currency),
      queryFn: () => loadHomeReadModel(currency),
      staleTime: forever,
    }),
    queryClient.prefetchQuery({
      queryKey: localQueryKeys.homeHighlights(highlightsQuery),
      queryFn: () => financeDataSource.home.loadHighlights({ ...highlightsQuery, at: Date.now() }),
      staleTime: forever,
    }),
    queryClient.prefetchQuery({
      queryKey: localQueryKeys.recentActivity(transactionsScope),
      queryFn: () =>
        financeDataSource.home.loadRecentActivity({ ...transactionsScope, at: Date.now() }),
      staleTime: forever,
    }),
    queryClient.prefetchQuery({
      queryKey: localQueryKeys.insightsOverview(overviewQuery),
      queryFn: () => financeDataSource.insights.loadOverview({ ...overviewQuery, at: Date.now() }),
      staleTime: forever,
    }),
    queryClient.prefetchQuery({
      queryKey: localQueryKeys.recentTransactions(
        "expense",
        currency,
        INSIGHTS_RECENT_TRANSACTIONS_LIMIT,
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

  // Tier 2 — never competes with first paint.
  // Analytics' default chart (this month's spending), so the tab opens drawn.
  // Key = use-insights-screen's "spending-daily" series at retry 0.
  const monthDays = elapsedDaysInCurrentMonth(new Date());
  void queryClient
    .prefetchQuery({
      queryKey: localQueryKeys.series("spending-daily", [currency, monthDays, 0]),
      queryFn: () => querySpendingSeries(currency, new Date(), monthDays),
      staleTime: forever,
    })
    .catch(() => undefined);
  // The full subscriptions catalog — heavier, opened less often.
  void queryClient
    .prefetchQuery({
      queryKey: localQueryKeys.subscriptionsCatalog(),
      queryFn: loadSubscriptionsCatalog,
      staleTime: forever,
    })
    .catch(() => undefined);
}
