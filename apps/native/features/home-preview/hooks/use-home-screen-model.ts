import { useMemo, useRef } from "react";

import type {
  HomeActivityItem,
  HomeActivityScopeSummary,
  HomeAccountCashflowScope,
} from "@/lib/dashboard-data";

import { applyAccountCashflowScope } from "../data/apply-account-cashflow-scope";
import {
  buildHomeActivityFilters,
  homeActivityViewItem,
  type HomeActivityViewItem,
  type HomePreviewDataFromReadModel,
} from "../data";
import type { HomeAccountCashflowScopeStatus } from "./use-home-account-cashflow-scope";

export function useHomeScreenModel({
  homeData,
  scopedAccountId,
  cashflowScope,
  loadCurrency,
  needsAuxiliaryActivity,
  scopedActivityItems,
  scopedActivityStatus,
  scopedActivityError,
  reloadScopedActivity,
  activityScope,
  activityScopeStatus,
}: {
  homeData: HomePreviewDataFromReadModel;
  scopedAccountId: string | undefined;
  cashflowScope: {
    status: HomeAccountCashflowScopeStatus;
    error: string | null;
    scope: HomeAccountCashflowScope | null;
  };
  loadCurrency: string;
  needsAuxiliaryActivity: boolean;
  scopedActivityItems: HomeActivityItem[];
  scopedActivityStatus: "idle" | "loading" | "ready" | "error";
  scopedActivityError: string | null;
  reloadScopedActivity: () => void;
  activityScope: HomeActivityScopeSummary | null;
  activityScopeStatus: "idle" | "loading" | "ready" | "error";
}) {
  const scopedHomeDataCache = useRef(new Map<string, HomePreviewDataFromReadModel>());

  const displayHomeData = useMemo(() => {
    if (!scopedAccountId) {
      return homeData;
    }
    if (cashflowScope.status === "ready" && cashflowScope.scope) {
      const scoped = applyAccountCashflowScope(homeData, cashflowScope.scope, loadCurrency);
      scopedHomeDataCache.current.set(scopedAccountId, scoped);
      return scoped;
    }
    const cached = scopedHomeDataCache.current.get(scopedAccountId);
    if (cached) {
      return cached;
    }
    // First visit to this account: keep the all-accounts chart mounted instead
    // of blanking the card while SQL runs.
    return homeData;
  }, [cashflowScope.scope, cashflowScope.status, homeData, loadCurrency, scopedAccountId]);

  const isCashflowScopeRefreshing =
    scopedAccountId !== undefined && cashflowScope.status === "loading";

  const activityItems = useMemo(
    () =>
      needsAuxiliaryActivity
        ? scopedActivityItems.map(homeActivityViewItem)
        : displayHomeData.activity.allItems,
    [displayHomeData.activity.allItems, needsAuxiliaryActivity, scopedActivityItems],
  );

  const activityFilters = useMemo(() => {
    if (scopedAccountId) {
      if (activityScope) {
        return buildHomeActivityFilters(
          activityScope.categoryCounts,
          activityScope.totalActivityCount,
        );
      }
      if (activityScopeStatus === "loading") {
        const cachedFilters = scopedHomeDataCache.current.get(scopedAccountId)?.activity.filters;
        if (cachedFilters) {
          return cachedFilters;
        }
        return buildHomeActivityFilters([], 0);
      }
    }
    return displayHomeData.activity.filters;
  }, [activityScope, activityScopeStatus, displayHomeData.activity.filters, scopedAccountId]);

  const homeDataForSection = useMemo(
    () => ({
      ...displayHomeData,
      activity: {
        ...displayHomeData.activity,
        filters: activityFilters,
        items: activityItems.slice(0, 5) as HomeActivityViewItem[],
        allItems: activityItems as HomeActivityViewItem[],
      },
    }),
    [activityFilters, activityItems, displayHomeData],
  );

  const activityQueryStatus =
    needsAuxiliaryActivity
      ? scopedActivityStatus === "idle"
        ? "loading"
        : scopedActivityStatus
      : "ready";

  return {
    displayHomeData,
    homeDataForSection,
    activityQueryStatus,
    activityQueryError: needsAuxiliaryActivity ? scopedActivityError : null,
    reloadActivity: needsAuxiliaryActivity ? reloadScopedActivity : undefined,
    isCashflowScopeRefreshing,
    cashflowScopeStatus: cashflowScope.status,
    cashflowScopeError: cashflowScope.error,
  };
}
