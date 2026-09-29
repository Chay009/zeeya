import { useMemo, useState } from "react";

import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";
import { formatMoney } from "@/features/dashboard/utils/format";
import { fromMinorUnits } from "@/lib/currency";
import { useToday } from "@/lib/today";

import {
  elapsedDaysInCurrentMonth,
  type AnalyticsDirection,
  type AnalyticsTab,
  type InsightsTimeScope,
} from "../analytics-scope";
import {
  monthlyComparisonFromMinorUnits,
  queryIncomeSeries,
  queryMonthlyIncomeSeries,
  queryMonthlySpendSeries,
  querySpendingSeries,
  type MonthlySpendComparison,
} from "../insights-data";
import {
  hasInsightsActivity,
  mapInsightsOverview,
  mapTopCategoriesToSlices,
} from "../insights-presentation";
import { useSeriesQuery } from "../use-series-query";
import { useDashboardCurrencies } from "./use-dashboard-currencies";
import { useInsightsOverview } from "./use-insights-overview";
import { useInsightsRecentTransactions } from "./use-insights-recent-transactions";

const EMPTY_COMPARISON: MonthlySpendComparison = {
  currentTotal: 0,
  previousTotal: 0,
  percentChange: null,
};

export function useInsightsScreen() {
  // Only what Analytics renders: pull-to-refresh. Sync status/progress would
  // re-render the whole tab on every inbox page of a running scan.
  const { refreshing, onRefresh } = useDashboardSync((state) => ({
    refreshing: state.refreshing,
    onRefresh: state.onRefresh,
  }));
  const {
    currencies: sqlCurrencies,
    status: currenciesStatus,
    error: currenciesError,
  } = useDashboardCurrencies();
  const currencies = sqlCurrencies.length > 0 ? sqlCurrencies : ["INR"];
  const [tabSelection, setTabSelection] = useState<AnalyticsTab>("outcome");
  const [timeScope, setTimeScope] = useState<InsightsTimeScope>("month");
  const [selectedCurrency, setSelectedCurrency] = useState<string | undefined>();
  const [seriesRetryKey, setSeriesRetryKey] = useState(0);
  const currency =
    selectedCurrency && currencies.includes(selectedCurrency)
      ? selectedCurrency
      : (currencies[0] ?? "INR");
  // The day drives day-dependent UI (month length, labels) and re-renders at
  // midnight; each fetch reads the clock itself when it runs.
  const today = useToday();
  const overviewQuery = useMemo(() => ({ currency, at: today }), [today, currency]);
  const {
    status: overviewStatus,
    overview,
    error: overviewError,
    reload: reloadOverview,
  } = useInsightsOverview(overviewQuery);
  const presentation = overview ? mapInsightsOverview(overview) : null;
  const showBudget = presentation?.budget !== null && presentation !== null;
  const effectiveTab = tabSelection === "budget" && !showBudget ? "outcome" : tabSelection;

  const atDate = useMemo(() => new Date(today), [today]);
  const direction: AnalyticsDirection = effectiveTab === "income" ? "income" : "expense";
  const recentTransactions = useInsightsRecentTransactions(direction, currency);
  const monthDays = elapsedDaysInCurrentMonth(atDate);
  // All four series load up front (no `enabled` gating) — they're small async
  // reads — so switching lens or range shows cached data instantly instead of
  // an empty chart that pops in when a just-enabled query resolves.

  const spendingSeriesQuery = useSeriesQuery(
    "spending-daily",
    () => querySpendingSeries(currency, new Date(), monthDays),
    [currency, monthDays, seriesRetryKey],
  );
  const incomeDailySeriesQuery = useSeriesQuery(
    "income-daily",
    () => queryIncomeSeries(currency, new Date(), monthDays),
    [currency, monthDays, seriesRetryKey],
  );
  const spendingMonthlySeriesQuery = useSeriesQuery(
    "spending-monthly",
    () => queryMonthlySpendSeries(currency, new Date(), 6),
    [currency, seriesRetryKey],
  );
  const incomeMonthlySeriesQuery = useSeriesQuery(
    "income-monthly",
    () => queryMonthlyIncomeSeries(currency, new Date(), 6),
    [currency, seriesRetryKey],
  );
  const spendingSeries = spendingSeriesQuery.value ?? [];
  const dailySeries =
    effectiveTab === "income" ? (incomeDailySeriesQuery.value ?? []) : spendingSeries;
  const monthlySeries =
    effectiveTab === "income"
      ? (incomeMonthlySeriesQuery.value ?? [])
      : (spendingMonthlySeriesQuery.value ?? []);
  // Month-over-month comparisons come only from the overview (like-for-like:
  // last month up to the same point). A separate full-month fallback query
  // showed one percentage while loading, then jumped to another.
  const overviewSpendingComparison: MonthlySpendComparison | null = presentation
    ? {
        currentTotal: fromMinorUnits(presentation.currentMonth.spendingMinorUnits, currency),
        previousTotal: fromMinorUnits(presentation.previousMonth.spendingMinorUnits, currency),
        percentChange: presentation.spendingChangePercent,
      }
    : null;
  const overviewIncomeComparison: MonthlySpendComparison | null = presentation
    ? monthlyComparisonFromMinorUnits(
        presentation.currentMonth.incomeMinorUnits,
        presentation.previousMonth.incomeMinorUnits,
        currency,
      )
    : null;
  const committedMonthlySpend = presentation
    ? formatMoney(
        fromMinorUnits(presentation.subscriptions.monthlyCommittedMinorUnits, currency),
        currency,
      )
    : null;
  const committedActiveCount = presentation?.subscriptions.activeCount ?? null;
  const spendingComparison = overviewSpendingComparison ?? EMPTY_COMPARISON;
  const comparison =
    (effectiveTab === "income" ? overviewIncomeComparison : overviewSpendingComparison) ??
    EMPTY_COMPARISON;
  const scopeSeriesError =
    timeScope === "month"
      ? effectiveTab === "income"
        ? incomeDailySeriesQuery.error
        : spendingSeriesQuery.error
      : effectiveTab === "income"
        ? incomeMonthlySeriesQuery.error
        : spendingMonthlySeriesQuery.error;
  const chartError = scopeSeriesError ?? (presentation ? null : overviewError);
  const categories = presentation ? mapTopCategoriesToSlices(presentation) : [];
  const categoryTotal = presentation
    ? fromMinorUnits(presentation.currentMonth.spendingMinorUnits, currency)
    : 0;

  const isOverviewLoading = overviewStatus === "loading" && overview === null;
  const isCategoryLoading = isOverviewLoading;
  const isSparklineLoading =
    effectiveTab === "income"
      ? incomeDailySeriesQuery.isInitialLoading
      : spendingSeriesQuery.isInitialLoading;
  const isScopeSeriesLoading =
    timeScope === "month"
      ? effectiveTab === "income"
        ? incomeDailySeriesQuery.isInitialLoading
        : spendingSeriesQuery.isInitialLoading
      : effectiveTab === "income"
        ? incomeMonthlySeriesQuery.isInitialLoading
        : spendingMonthlySeriesQuery.isInitialLoading;
  const isLoading = isScopeSeriesLoading || isOverviewLoading;
  const materialChangeNotice =
    !isLoading && comparison.percentChange !== null && Math.abs(comparison.percentChange) >= 20
      ? effectiveTab === "income"
        ? "Income changed materially compared with this time last month."
        : "Spending changed materially compared with this time last month."
      : null;

  return {
    refreshing,
    currencies,
    currenciesStatus,
    currenciesError,
    currency,
    setSelectedCurrency,
    tabSelection,
    setTabSelection,
    timeScope,
    setTimeScope,
    presentation,
    showBudget,
    effectiveTab,
    direction,
    overviewStatus,
    overviewError,
    reloadOverview,
    spendingComparison,
    spendingSeries,
    overviewSpendingSeriesError: spendingSeriesQuery.error,
    committedMonthlySpend,
    committedActiveCount,
    comparison,
    monthlySeries,
    dailySeries,
    isOverviewLoading,
    isCategoryLoading,
    isSparklineLoading,
    isLoading,
    chartError,
    categories,
    categoryTotal,
    transactions: recentTransactions.items,
    transactionsStatus: recentTransactions.status,
    transactionsError: recentTransactions.error,
    reloadTransactions: recentTransactions.reload,
    materialChangeNotice,
    hasActivity: presentation ? hasInsightsActivity(presentation) : false,
    atDate,
    refresh: () => {
      void onRefresh();
    },
    retrySeries: () => setSeriesRetryKey((current) => current + 1),
  };
}
