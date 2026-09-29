// Full subscriptions + mandates catalog for the stack subscriptions list —
// distinct from Home's capped subscriptionOverview preview inside the read
// model. SQL aggregates (monthlySpend, active/cancelled counts) still come
// from the bounded Home read model; only the item rows are loaded in full
// via FinanceDataSource.
import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import { localQueryKeys } from "@/lib/local-query-keys";
import { useLocalQuery } from "@/lib/use-local-query";

import { previewSubFromSubscriptionSummary, type PreviewSub } from "../data";
import { loadAllMandates, mandatePreviewSub } from "./subscription-sources";
import { useHomeData } from "./use-home-data";

// Every subscription + mandate row with its event history. Exported so the
// boot cache can warm it; cached (and kept live) so reopening the
// Subscriptions screen doesn't redo the mandate event reads.
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
  const mandateItems = mandates.map((mandate) =>
    mandatePreviewSub(mandate, eventsByMandate.get(mandate.mandateId) ?? []),
  );
  const subscriptionItems = subscriptions.map(previewSubFromSubscriptionSummary);
  return [...mandateItems, ...subscriptionItems].sort((left, right) =>
    right.key.localeCompare(left.key),
  );
}

const EMPTY_ITEMS: PreviewSub[] = [];

export function useSubscriptionsCatalog() {
  // Totals come from the shared (already cached, memoized) Home data.
  const overview = useHomeData().homeData.subscriptions;
  const { data, status, error, reload } = useLocalQuery({
    queryKey: localQueryKeys.subscriptionsCatalog(),
    queryFn: loadSubscriptionsCatalog,
  });

  return {
    status,
    error,
    reload,
    subscriptions: {
      items: data ?? EMPTY_ITEMS,
      monthlySpend: overview.monthlySpend,
      expectedMonthlyMinorUnits: overview.expectedMonthlyMinorUnits,
      activeCount: overview.activeCount,
      cancelledCount: overview.cancelledCount,
    },
  };
}
