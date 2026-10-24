import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import type { HomeAccountCashflowScope } from "@/lib/dashboard-data";
import { localQueryKeys } from "@/lib/local-query-keys";
import { useLocalQuery } from "@/lib/use-local-query";

export type HomeAccountCashflowScopeStatus = "idle" | "loading" | "ready" | "error";

// Per-account cashflow, cached per (account, currency).
// While the same account revalidates the last snapshot stays on screen;
// switching accounts never shows another account's numbers.
export function useHomeAccountCashflowScope(
  accountId: string | undefined,
  currency: string,
): {
  status: HomeAccountCashflowScopeStatus;
  error: string | null;
  scope: HomeAccountCashflowScope | null;
} {
  const { data, status, error, isRevalidating } = useLocalQuery({
    queryKey: localQueryKeys.accountCashflowScope(accountId ?? "", currency),
    queryFn: () =>
      financeDataSource.home.loadAccountCashflowScope({
        accountId: accountId!,
        currency,
        at: Date.now(),
      }),
    enabled: accountId !== undefined,
    keepPrevious: (previousKey) =>
      previousKey[1] === "account-cashflow-scope" &&
      previousKey[2] === accountId &&
      previousKey[3] === currency,
  });

  if (!accountId) return { status: "idle", error: null, scope: null };
  if (status !== "ready" || !data) return { status, error, scope: null };
  // "loading" with a scope: the same account refreshing in the background
  // (Home dims the chart rather than blanking it).
  return { status: isRevalidating ? "loading" : "ready", error: null, scope: data };
}
