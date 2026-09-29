// Fetches the real transaction list for one calendar day, used by the
// Calendar day-tap bottom sheet. Cached per (day, currency): tapping
// back to a day you already opened is instant. While a new day loads, the
// previous day's rows stay visible (status "loading") rather than flashing
// to empty.
import { queryTransactionsForDay } from "@/db/queries";
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

// Not start + 24h: a local day is 23 or 25 hours across a DST change.
function nextLocalMidnight(dayStartMs: number): number {
  const day = new Date(dayStartMs);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
}

export function useDayTransactions(
  dayStartMs: number | null,
  currency: string,
): DayTransactionsState {
  const { data, status, error, isRevalidating } = useLocalQuery({
    queryKey: localQueryKeys.dayTransactions(dayStartMs ?? 0, currency),
    queryFn: () => queryTransactionsForDay(dayStartMs!, nextLocalMidnight(dayStartMs!) - 1, currency),
    enabled: dayStartMs !== null,
    keepPrevious: (previousKey) => previousKey[1] === "day-transactions",
  });

  if (dayStartMs === null) return { status: "idle", error: null, items: EMPTY };
  if (status !== "ready" || !data) return { status, error, items: EMPTY };
  // "loading" with rows: another day's rows stay visible while this day loads.
  return { status: isRevalidating ? "loading" : "ready", error: null, items: data };
}
