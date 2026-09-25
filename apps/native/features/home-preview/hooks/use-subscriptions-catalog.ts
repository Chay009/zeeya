// Full subscriptions + mandates catalog for the stack subscriptions list —
// distinct from Home's capped subscriptionOverview preview inside the read
// model. SQL aggregates (monthlySpend, active/cancelled counts) still come
// from the bounded Home read model; only the item rows are loaded in full
// via FinanceDataSource.
import { useCallback, useEffect, useState } from "react";

import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";
import { useHomeReadModel } from "@/features/dashboard/hooks/home-read-model";
import type { MandateCursor, MandateSummary } from "@/lib/dashboard-data";

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

export function useSubscriptionsCatalog() {
  const { status: syncStatus, syncRevision } = useDashboardSync();
  const { model: readModel } = useHomeReadModel("INR");
  const [items, setItems] = useState<PreviewSub[]>([]);
  const [status, setStatus] = useState<SubscriptionsCatalogStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const at = Date.now();
      const [subscriptions, mandates] = await Promise.all([
        financeDataSource.subscriptions.list({ at }),
        loadAllMandates(),
      ]);
      const mandateItems = await Promise.all(
        mandates.map(async (mandate) => {
          const events = await financeDataSource.mandates.listEvents({
            mandateId: mandate.mandateId,
            limit: 30,
          });
          return previewSubFromMandateSummary(
            mandate,
            events.items,
            mandateReactivated(mandate, events.items),
          );
        }),
      );
      const subscriptionItems = subscriptions.map(previewSubFromSubscriptionSummary);
      setItems(
        [...mandateItems, ...subscriptionItems].sort((left, right) =>
          right.key.localeCompare(left.key),
        ),
      );
      setStatus("ready");
    } catch (cause: unknown) {
      setItems([]);
      setStatus("error");
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, syncRevision]);

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
