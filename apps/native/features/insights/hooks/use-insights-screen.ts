import { useMemo, useState } from "react";

import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";
import { formatMoney } from "@/features/dashboard/utils/format";
import { fromMinorUnits } from "@/lib/currency";
import { useSyncAnchor } from "@/lib/sync-anchor";

import {
  elapsedDaysInCurrentMonth,
  usesDailySeries,
  type AnalyticsDirection,
  type AnalyticsTab,
  type InsightsTimeScope,
} from "../analytics-scope";
import {
  monthlyComparisonFromMinorUnits,
  queryIncomeSeries,
  queryMonthlyDirectionComparison,
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
  const { status, error, progress, refreshing, onRefresh, connect, syncRevision } =
    useDashboardSync();
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
  // Shared per-revision anchor: stable cache keys across mounts, and the same
  // `at` the boot cache prefetched with.
  const at = useSyncAnchor(syncRevision);
  const overviewQuery = useMemo(() => ({ currency, at }), [at, currency]);
  const {
    status: overviewStatus,
    overview,
    error: overviewError,
    reload: reloadOverview,
  } = useInsightsOverview(overviewQuery);
  const presentation = overview ? mapInsightsOverview(overview) : null;
  const showBudget = presentation?.budget !== null && presentation !== null;
  const effectiveTab = tabSelection === "budget" && !showBudget ? "outcome" : tabSelection;

  const atDate = useMemo(() => new Date(at), [at]);
  const direction: AnalyticsDirection = effectiveTab === "income" ? "income" : "expense";
  const recentTransactions = useInsightsRecentTransactions(direction, currency);
  const monthDays = elapsedDaysInCurrentMonth(atDate);
  const usesDaily = usesDailySeries(timeScope);
  const usesMonthly = timeScope === "sixMonths";
  const incomeSeriesEnabled = effectiveTab === "income";
  const outcomeMonthlyEnabled = effectiveTab !== "income" && usesMonthly;

  const spendingSeriesQuery = useSeriesQuery(
    "spending-daily",
    () => querySpendingSeries(currency, atDate, monthDays),
    [atDate, currency, monthDays, seriesRetryKey, syncRevision],
  );
  const incomeDailySeriesQuery = useSeriesQuery(
    "income-daily",
    () => queryIncomeSeries(currency, atDate, monthDays),
    [atDate, currency, monthDays, seriesRetryKey, syncRevision],
    incomeSeriesEnabled && usesDaily,
  );
  const spendingMonthlySeriesQuery = useSeriesQuery(
    "spending-monthly",
    () => queryMonthlySpendSeries(currency, atDate, 6),
    [atDate, currency, seriesRetryKey, syncRevision],
    outcomeMonthlyEnabled,
  );
  const incomeMonthlySeriesQuery = useSeriesQuery(
    "income-monthly",
    () => queryMonthlyIncomeSeries(currency, atDate, 6),
    [atDate, currency, seriesRetryKey, syncRevision],
    incomeSeriesEnabled && usesMonthly,
  );
  const queriedComparisonQuery = useSeriesQuery(
    "direction-comparison",
    () =>
      queryMonthlyDirectionComparison({
        currency,
        direction: effectiveTab === "income" ? "income" : "expense",
        now: atDate,
      }),
    [atDate, currency, effectiveTab, seriesRetryKey, syncRevision],
    !presentation,
  );
  const queriedSpendingComparisonQuery = useSeriesQuery(
    "spending-comparison",
    () => queryMonthlyDirectionComparison({ currency, direction: "expense", now: atDate }),
    [atDate, currency, seriesRetryKey, syncRevision],
    !presentation,
  );

  const spendingSeries = spendingSeriesQuery.value ?? [];
  const dailySeries =
    effectiveTab === "income" ? (incomeDailySeriesQuery.value ?? []) : spendingSeries;
  const monthlySeries =
    effectiveTab === "income"
      ? (incomeMonthlySeriesQuery.value ?? [])
      : (spendingMonthlySeriesQuery.value ?? []);
  const queriedComparison = queriedComparisonQuery.value;
  const queriedSpendingComparison = queriedSpendingComparisonQuery.value;
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
  const spendingComparison = overviewSpendingComparison ??
    queriedSpendingComparison ?? EMPTY_COMPARISON;
  const comparison =
    effectiveTab === "income"
      ? (overviewIncomeComparison ?? queriedComparison ?? EMPTY_COMPARISON)
      : (overviewSpendingComparison ?? queriedComparison ?? EMPTY_COMPARISON);
  const scopeSeriesError =
    timeScope === "month"
      ? effectiveTab === "income"
        ? incomeDailySeriesQuery.error
        : spendingSeriesQuery.error
      : effectiveTab === "income"
        ? incomeMonthlySeriesQuery.error
        : spendingMonthlySeriesQuery.error;
  const comparisonError =
    effectiveTab === "income"
      ? overviewIncomeComparison
        ? null
        : queriedComparisonQuery.error
      : overviewSpendingComparison
        ? null
        : queriedSpendingComparisonQuery.error;
  const chartError = scopeSeriesError ?? comparisonError;
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
  const isComparisonLoading =
    effectiveTab === "income"
      ? !overviewIncomeComparison && queriedComparisonQuery.isInitialLoading
      : !overviewSpendingComparison && queriedComparisonQuery.isInitialLoading;
  const isLoading = isScopeSeriesLoading || isComparisonLoading;
  const materialChangeNotice =
    !isLoading && comparison.percentChange !== null && Math.abs(comparison.percentChange) >= 20
      ? effectiveTab === "income"
        ? "Income changed materially compared with the previous month."
        : "Spending changed materially compared with the previous month."
      : null;

  return {
    status,
    error,
    progress,
    refreshing,
    connect,
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
