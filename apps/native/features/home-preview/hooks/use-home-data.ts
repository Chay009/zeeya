import { useMemo } from "react";

import { useHomeReadModel } from "@/features/dashboard/hooks/home-read-model";
import { usePrimaryCurrency } from "@/features/insights/hooks/use-dashboard-currencies";
import type { HomeReadModel } from "@/lib/dashboard-data";
import { useToday } from "@/lib/today";

import { createHomePreviewDataFromReadModel } from "../data";

export function emptyHomeReadModel(currency: string): HomeReadModel {
  return {
    currency,
    accounts: [],
    detectedAccounts: [],
    unassignedReadings: [],
    monthTotals: { incomeByCurrency: {}, expenseByCurrency: {} },
    categoryTotalsByCurrency: {},
    availableCurrencies: [],
    flowDays: [],
    calendarMonths: { items: [], nextCursor: null },
    subscriptionOverview: { items: [], totalsByCurrency: {}, activeCount: 0, cancelledCount: 0 },
    recentActivity: [],
    activityCategoryCounts: [],
    totalActivityCount: 0,
  };
}

/**
 * The Home read model and its presentation, shared by Home, Accounts and
 * Transactions — all keyed by the primary currency (unless Home's chart
 * selector overrides it), so they share one cached read.
 *
 * Data is real as soon as the read model is loaded. The inbox sync status
 * is NOT part of that: SQLite holds the last published projection, and a
 * running sync only means newer rows may follow (and will, live).
 *
 * `isLoading` is true only when there is nothing to show yet — the one case
 * a skeleton is right. Empty states must wait for it to clear, so "No
 * balance yet" never flashes while data is on its way.
 */
export function useHomeData(currencyOverride?: string) {
  const primary = usePrimaryCurrency();
  const currency = currencyOverride ?? primary;
  const { model, status, error, reload } = useHomeReadModel(currency);
  const today = useToday();

  // `today` is a dependency so day-relative labels recompute at midnight.
  const homeData = useMemo(
    () =>
      createHomePreviewDataFromReadModel(model ?? emptyHomeReadModel(currency), model !== null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currency, model, today],
  );

  return {
    currency,
    model,
    homeData,
    isLoading: model === null && status === "loading",
    status,
    error,
    reload,
  };
}
