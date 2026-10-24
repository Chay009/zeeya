import { useMemo } from "react";

import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import { localQueryKeys } from "@/lib/local-query-keys";
import { useLocalQuery, type LocalQueryStatus } from "@/lib/use-local-query";

import {
  normalizeInsightsTransactionRows,
  type InsightsTransactionRow,
} from "../insights-transaction-presentation";

export const INSIGHTS_RECENT_TRANSACTIONS_LIMIT = 25;

export interface InsightsRecentTransactionsQuery {
  direction: "income" | "expense";
  currency: string;
  limit: number;
}

export interface UseInsightsRecentTransactionsResult {
  status: LocalQueryStatus;
  error: string | null;
  items: InsightsTransactionRow[];
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

const EMPTY: InsightsTransactionRow[] = [];

export function useInsightsRecentTransactions(
  direction: "income" | "expense",
  currency: string,
): UseInsightsRecentTransactionsResult {
  const limit = INSIGHTS_RECENT_TRANSACTIONS_LIMIT;
  const { data, status, error, reload } = useLocalQuery({
    queryKey: localQueryKeys.recentTransactions(direction, currency, limit),
    queryFn: () => loadRecentInsightsTransactions({ direction, currency, limit }),
    keepPrevious: false,
  });
  // loadRecentInsightsTransactions already normalizes; this only keeps the
  // empty fallback referentially stable.
  const items = useMemo(() => data ?? EMPTY, [data]);
  return { status, error, items, reload };
}
