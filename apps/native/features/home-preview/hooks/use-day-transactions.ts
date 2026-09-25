// Fetches the real transaction list for one calendar day, used by the
// Calendar day-tap bottom sheet. The query uses expo-sqlite's async client
// directly so the native read does not block the JS thread before the
// calendar highlight can paint. It intentionally skips the full projection
// freshness check used by the paginated transaction screen.
import { useEffect, useRef, useState } from "react";

import { queryTransactionsForDay } from "@/db/queries";
import type { TransactionSummary } from "@/lib/dashboard-data";

export type DayTransactionsStatus = "idle" | "loading" | "ready" | "error";

export interface DayTransactionsState {
  status: DayTransactionsStatus;
  error: string | null;
  items: TransactionSummary[];
}

const IDLE_STATE: DayTransactionsState = { status: "idle", error: null, items: [] };

export function useDayTransactions(
  dayStartMs: number | null,
  currency: string,
): DayTransactionsState {
  const [state, setState] = useState<DayTransactionsState>(IDLE_STATE);
  // Kept across renders so switching days shows the previous day's rows
  // (dimmed by "loading" status, not wiped to empty) while the new query
  // resolves, instead of a flash-to-empty that reads as extra lag.
  const lastItemsRef = useRef<TransactionSummary[]>([]);

  useEffect(() => {
    if (dayStartMs === null) {
      lastItemsRef.current = [];
      setState(IDLE_STATE);
      return;
    }
    let cancelled = false;
    setState({ status: "loading", error: null, items: lastItemsRef.current });
    const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000 - 1;
    void queryTransactionsForDay(dayStartMs, dayEndMs, currency)
      .then((items) => {
        if (cancelled) return;
        lastItemsRef.current = items;
        setState({ status: "ready", error: null, items });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          error: cause instanceof Error ? cause.message : String(cause),
          items: [],
        });
      });
    return () => {
      cancelled = true;
    };
  }, [dayStartMs, currency]);

  return state;
}
