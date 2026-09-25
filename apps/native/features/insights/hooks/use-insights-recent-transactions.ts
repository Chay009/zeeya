import { useCallback, useMemo } from "react";

import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";
import { localQueryKeys } from "@/lib/local-query-keys";
import { useLocalQuery } from "@/lib/use-local-query";

import {
  normalizeInsightsTransactionRows,
  type InsightsTransactionRow,
} from "../insights-transaction-presentation";
import type {
  InsightsRecentTransactionsQuery,
  InsightsRecentTransactionsState,
  InsightsRecentTransactionsStatus,
} from "./insights-recent-transactions-controller";

/** Main-screen preview shows the first few rows; the detail sheet shows the full list. */
export const INSIGHTS_RECENT_TRANSACTIONS_PREVIEW_LIMIT = 3;
export const INSIGHTS_RECENT_TRANSACTIONS_LIMIT = 25;

export type {
  InsightsRecentTransactionsState,
  InsightsRecentTransactionsStatus,
} from "./insights-recent-transactions-controller";

export interface UseInsightsRecentTransactionsResult extends InsightsRecentTransactionsState {
  reload: () => void;
}

export async function loadRecentInsightsTransactions(
  query: InsightsRecentTransactionsQuery,
): Promise<InsightsTransactionRow[]> {
  const page = await financeDataSource.transactions.list({
    direction: query.direction,
    currency: query.currency,
    limit: query.limit,
  });
  return normalizeInsightsTransactionRows(page.items);
}

export function useInsightsRecentTransactions(
  direction: "income" | "expense",
  currency: string,
): UseInsightsRecentTransactionsResult {
  const { syncRevision } = useDashboardSync();
  const query = useMemo(
    () => ({
      direction,
      currency,
      limit: INSIGHTS_RECENT_TRANSACTIONS_LIMIT,
    }),
    [currency, direction],
  );

  const { data, error, isInitialLoading, refetch } = useLocalQuery({
    queryKey: localQueryKeys.recentTransactions(
      query.direction,
      query.currency,
      query.limit,
      syncRevision,
    ),
    queryFn: () => loadRecentInsightsTransactions(query),
  });

  const reload = useCallback(() => {
    void refetch();
  }, [refetch]);

  const status: InsightsRecentTransactionsStatus = isInitialLoading
    ? "loading"
    : error
      ? "error"
      : "ready";

  const items = useMemo(() => normalizeInsightsTransactionRows(data ?? []), [data]);

  return {
    status,
    error,
    items,
    direction: query.direction,
    currency: query.currency,
    reload,
  };
}
