import { useMemo } from "react";

import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import type { BudgetOverview, CategoryBudgetInput } from "@/lib/dashboard-data";
import { localQueryKeys } from "@/lib/local-query-keys";
import { useToday } from "@/lib/today";
import { useLocalQuery, type LocalQueryStatus } from "@/lib/use-local-query";

import {
  budgetRows,
  budgetSummary,
  unbudgetedCategories,
  type BudgetRowView,
  type BudgetSummaryView,
} from "../budget-presentation";

export interface UseBudgetsResult {
  status: LocalQueryStatus;
  error: string | null;
  reload: () => void;
  overview: BudgetOverview | null;
  rows: BudgetRowView[];
  summary: BudgetSummaryView | null;
}

const NO_ROWS: BudgetRowView[] = [];

/** This month's budgets in one currency. Live: a save or a sync re-reads it. */
export function useBudgets(currency: string): UseBudgetsResult {
  const { data, status, error, reload } = useLocalQuery({
    queryKey: localQueryKeys.budgets(currency),
    queryFn: () => financeDataSource.budgets.load({ currency, at: Date.now() }),
    keepPrevious: false,
  });
  // Pace depends on the day; `today` re-derives it at midnight.
  const today = useToday();
  const rows = useMemo(
    () => (data ? budgetRows(data, Math.max(today, Date.now())) : NO_ROWS),
    [data, today],
  );
  const summary = useMemo(() => budgetSummary(rows), [rows]);
  return { status, error, reload, overview: data ?? null, rows, summary };
}

export function useUnbudgetedCategories(overview: BudgetOverview | null) {
  return useMemo(() => (overview ? unbudgetedCategories(overview) : []), [overview]);
}

/** Saves (or removes, with a null limit) one budget; screens re-read live. */
export function saveBudget(input: CategoryBudgetInput): Promise<void> {
  return financeDataSource.budgets.set(input);
}
