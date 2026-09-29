import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import type { HomeActivityScopeSummary } from "@/lib/dashboard-data";
import { localQueryKeys } from "@/lib/local-query-keys";
import { useLocalQuery } from "@/lib/use-local-query";

export type HomeActivityScopeStatus = "idle" | "loading" | "ready" | "error";

// Per-account activity summary, cached per account. The
// previous summary stays visible only while the same account revalidates.
export function useHomeActivityScope(accountId: string | undefined): {
  status: HomeActivityScopeStatus;
  error: string | null;
  scope: HomeActivityScopeSummary | null;
} {
  const { data, status, error } = useLocalQuery({
    queryKey: localQueryKeys.activityScope(accountId ?? ""),
    queryFn: () => financeDataSource.home.loadActivityScope({ accountId: accountId! }),
    enabled: accountId !== undefined,
    keepPrevious: (previousKey) => previousKey[1] === "activity-scope" && previousKey[2] === accountId,
  });

  if (!accountId) return { status: "idle", error: null, scope: null };
  return { status, error, scope: data ?? null };
}
