import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";
import type { HomeActivityScopeSummary } from "@/lib/dashboard-data";
import { localQueryKeys } from "@/lib/local-query-keys";
import { useLocalQuery } from "@/lib/use-local-query";

export type HomeActivityScopeStatus = "idle" | "loading" | "ready" | "error";

// Per-account activity summary, cached per (account, sync revision). The
// previous summary stays visible only while the same account revalidates.
export function useHomeActivityScope(accountId: string | undefined): {
  status: HomeActivityScopeStatus;
  error: string | null;
  scope: HomeActivityScopeSummary | null;
} {
  const { syncRevision } = useDashboardSync();
  const { data, error, isInitialLoading } = useLocalQuery({
    queryKey: localQueryKeys.activityScope(accountId ?? "", syncRevision),
    queryFn: () => financeDataSource.home.loadActivityScope({ accountId: accountId! }),
    enabled: accountId !== undefined,
    keepPrevious: (previousKey) => previousKey[1] === "activity-scope" && previousKey[2] === accountId,
  });

  if (!accountId) return { status: "idle", error: null, scope: null };
  if (isInitialLoading || (!data && !error)) return { status: "loading", error: null, scope: null };
  if (error && !data) return { status: "error", error, scope: null };
  return { status: "ready", error: null, scope: data ?? null };
}
