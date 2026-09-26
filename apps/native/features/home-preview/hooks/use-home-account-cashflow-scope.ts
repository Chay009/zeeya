import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";
import type { HomeAccountCashflowScope } from "@/lib/dashboard-data";
import { localQueryKeys } from "@/lib/local-query-keys";
import { useLocalQuery } from "@/lib/use-local-query";

export type HomeAccountCashflowScopeStatus = "idle" | "loading" | "ready" | "error";

// Per-account cashflow, cached per (account, currency, anchor, revision).
// While the same account revalidates the last snapshot stays on screen;
// switching accounts never shows another account's numbers.
export function useHomeAccountCashflowScope(
  accountId: string | undefined,
  currency: string,
  at: number,
): {
  status: HomeAccountCashflowScopeStatus;
  error: string | null;
  scope: HomeAccountCashflowScope | null;
} {
  const { syncRevision } = useDashboardSync();
  const { data, error, isInitialLoading, isRevalidating } = useLocalQuery({
    queryKey: localQueryKeys.accountCashflowScope(accountId ?? "", currency, at, syncRevision),
    queryFn: () => financeDataSource.home.loadAccountCashflowScope({ accountId: accountId!, currency, at }),
    enabled: accountId !== undefined,
    keepPrevious: (previousKey) =>
      previousKey[1] === "account-cashflow-scope" && previousKey[2] === accountId,
  });

  if (!accountId) return { status: "idle", error: null, scope: null };
  if (error && !data) return { status: "error", error, scope: null };
  if (isInitialLoading || !data) return { status: "loading", error: null, scope: null };
  return { status: isRevalidating ? "loading" : "ready", error: null, scope: data };
}
