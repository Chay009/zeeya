// Full subscriptions + mandates catalog for the stack subscriptions list —
// distinct from Home's capped subscriptionOverview preview inside the read
// model. SQL aggregates (monthlySpend, active/cancelled counts) still come
// from the bounded Home read model; only the item rows are loaded in full
// via FinanceDataSource.
import { useCallback } from "react";

import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";
import { useHomeReadModel } from "@/features/dashboard/hooks/home-read-model";
import type { MandateCursor, MandateSummary } from "@/lib/dashboard-data";
import { localQueryKeys } from "@/lib/local-query-keys";
import { useLocalQuery } from "@/lib/use-local-query";

import {
  createHomePreviewDataFromReadModel,
  previewSubFromMandateSummary,
  previewSubFromSubscriptionSummary,
  type PreviewSub,
} from "../data";

const EMPTY_READ_MODEL = {
  currency: "INR",
  accounts: [],
  detectedAccounts: [],
  unassignedReadings: [],
  monthTotals: { incomeByCurrency: {}, expenseByCurrency: {} },
  categoryTotalsByCurrency: {},
  availableCurrencies: [] as string[],
  flowDays: [],
  calendarMonths: { items: [], nextCursor: null },
  subscriptionOverview: {
    items: [],
    totalsByCurrency: {},
    activeCount: 0,
    cancelledCount: 0,
  },
  recentActivity: [],
  activityCategoryCounts: [],
  totalActivityCount: 0,
};

export type SubscriptionsCatalogStatus = "loading" | "ready" | "error";

async function loadAllMandates(): Promise<MandateSummary[]> {
  const mandates: MandateSummary[] = [];
  let cursor: MandateCursor | undefined;
  do {
    const page = await financeDataSource.mandates.list({ limit: 100, cursor });
    mandates.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return mandates;
}

function mandateReactivated(
  mandate: MandateSummary,
  events: { status: "active" | "cancelled" }[],
): boolean {
  return mandate.status === "active" && events.some((event) => event.status === "cancelled");
}

// Every subscription + mandate row with its event history. Exported so the
// boot cache can warm it; cached per sync revision so reopening the
// Subscriptions screen doesn't redo the per-mandate event reads.
export async function loadSubscriptionsCatalog(): Promise<PreviewSub[]> {
  const at = Date.now();
  const [subscriptions, mandates] = await Promise.all([
    financeDataSource.subscriptions.list({ at }),
    loadAllMandates(),
  ]);
  // One batched read for every mandate's recent history (was one query per
  // mandate).
  const eventsByMandate = await financeDataSource.mandates.listRecentEventsFor(
    mandates.map((mandate) => mandate.mandateId),
    30,
  );
  const mandateItems = mandates.map((mandate) => {
    const events = eventsByMandate.get(mandate.mandateId) ?? [];
    return previewSubFromMandateSummary(mandate, events, mandateReactivated(mandate, events));
  });
  const subscriptionItems = subscriptions.map(previewSubFromSubscriptionSummary);
  return [...mandateItems, ...subscriptionItems].sort((left, right) =>
    right.key.localeCompare(left.key),
  );
}

const EMPTY_ITEMS: PreviewSub[] = [];

export function useSubscriptionsCatalog() {
  const { status: syncStatus, syncRevision } = useDashboardSync();
  const { model: readModel } = useHomeReadModel("INR");
  const { data, error: queryError, isInitialLoading, refetch } = useLocalQuery({
    queryKey: localQueryKeys.subscriptionsCatalog(syncRevision),
    queryFn: loadSubscriptionsCatalog,
  });
  const items = data ?? EMPTY_ITEMS;
  const status: SubscriptionsCatalogStatus = isInitialLoading
    ? "loading"
    : queryError && !data
      ? "error"
      : "ready";
  const error = status === "error" ? queryError : null;
  const load = useCallback(() => {
    void refetch();
  }, [refetch]);

  const overview = createHomePreviewDataFromReadModel(
    readModel ?? EMPTY_READ_MODEL,
    syncStatus === "ready" && readModel !== null,
  ).subscriptions;

  return {
    status,
    error,
    reload: load,
    subscriptions: {
      items,
      monthlySpend: overview.monthlySpend,
      expectedMonthlyMinorUnits: overview.expectedMonthlyMinorUnits,
      activeCount: overview.activeCount,
      cancelledCount: overview.cancelledCount,
    },
  };
}
