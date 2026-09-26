// Fetches the real transaction list for one calendar day, used by the
// Calendar day-tap bottom sheet. Cached per (day, currency, revision): tapping
// back to a day you already opened is instant. While a new day loads, the
// previous day's rows stay visible (status "loading") rather than flashing
// to empty.
import { queryTransactionsForDay } from "@/db/queries";
import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";
import type { TransactionSummary } from "@/lib/dashboard-data";
import { localQueryKeys } from "@/lib/local-query-keys";
import { useLocalQuery } from "@/lib/use-local-query";

export type DayTransactionsStatus = "idle" | "loading" | "ready" | "error";

export interface DayTransactionsState {
  status: DayTransactionsStatus;
  error: string | null;
  items: TransactionSummary[];
}

const EMPTY: TransactionSummary[] = [];
const DAY_MS = 24 * 60 * 60 * 1000;

export function useDayTransactions(
  dayStartMs: number | null,
  currency: string,
): DayTransactionsState {
  const { syncRevision } = useDashboardSync();
  const { data, error, isInitialLoading, isRevalidating } = useLocalQuery({
    queryKey: localQueryKeys.dayTransactions(dayStartMs ?? 0, currency, syncRevision),
    queryFn: () => queryTransactionsForDay(dayStartMs!, dayStartMs! + DAY_MS - 1, currency),
    enabled: dayStartMs !== null,
    keepPrevious: (previousKey) => previousKey[1] === "day-transactions",
  });

  if (dayStartMs === null) return { status: "idle", error: null, items: EMPTY };
  if (error && !data) return { status: "error", error, items: EMPTY };
  if (isInitialLoading || isRevalidating || !data) {
    return { status: "loading", error: null, items: data ?? EMPTY };
  }
  return { status: "ready", error: null, items: data };
}
