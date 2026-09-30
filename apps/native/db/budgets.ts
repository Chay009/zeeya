// Per-category monthly budgets: the user's limits (category_budgets, user-
// owned) read against this month's projected spending (transactions).
import { and, eq } from "drizzle-orm";

import type {
  BudgetCategorySpend,
  BudgetOverview,
  BudgetOverviewQuery,
  CategoryBudgetInput,
  CategoryBudgetStatus,
} from "../lib/dashboard-data";
import { clearBudgetAlert, resetBudgetAlertBaseline } from "./budget-alerts";
import { readClient, writeDb } from "./connection";
import { notifyDataChanged } from "./data-changes";
import { readConsistentSnapshot } from "./projection-snapshot";
import type { AsyncQueryClient } from "./queries";
import { categoryBudgets } from "./schema";

/** Full months before the current one that suggestions average over. */
export const BUDGET_HISTORY_MONTHS = 3;

function monthBounds(at: Date, offset: number): number {
  return new Date(at.getFullYear(), at.getMonth() + offset, 1).getTime();
}

export async function queryBudgetOverviewUnsafe(
  query: BudgetOverviewQuery,
  client: AsyncQueryClient = readClient(),
): Promise<BudgetOverview> {
  const at = new Date(query.at);
  if (!Number.isFinite(at.getTime())) throw new Error(`at must be a valid timestamp, got ${query.at}`);
  const monthStart = monthBounds(at, 0);
  const monthEnd = monthBounds(at, 1);
  const historyStart = monthBounds(at, -BUDGET_HISTORY_MONTHS);

  const [budgets, spendRows, activeMonthRows] = await Promise.all([
    client.getAllAsync<CategoryBudgetStatus>(
      `SELECT b.category AS category,
              b.monthly_limit_minor_units AS limitMinorUnits,
              COALESCE((
                SELECT SUM(t.amount_minor_units) FROM transactions t
                WHERE t.currency = b.currency AND t.category = b.category
                  AND t.direction = 'expense' AND t.date >= ? AND t.date < ?
              ), 0) AS spentMinorUnits
       FROM category_budgets b
       WHERE b.currency = ?
       ORDER BY b.category`,
      [monthStart, monthEnd, query.currency],
    ),
    // Each category's spend this month and over the history window.
    client.getAllAsync<{ category: string; thisMonth: number; history: number }>(
      `SELECT category,
              SUM(CASE WHEN date >= ? THEN amount_minor_units ELSE 0 END) AS thisMonth,
              SUM(CASE WHEN date < ? THEN amount_minor_units ELSE 0 END) AS history
       FROM transactions
       WHERE currency = ? AND direction = 'expense' AND date >= ? AND date < ?
       GROUP BY category`,
      [monthStart, monthStart, query.currency, historyStart, monthEnd],
    ),
    // How many of those history months have any spending at all: a newer
    // install (a 90-day import, or an account added last month) averages
    // over the months it actually has, not over empty ones.
    client.getAllAsync<{ months: number }>(
      `SELECT COUNT(DISTINCT strftime('%Y-%m', date / 1000, 'unixepoch', 'localtime')) AS months
       FROM transactions
       WHERE currency = ? AND direction = 'expense' AND date >= ? AND date < ?`,
      [query.currency, historyStart, monthStart],
    ),
  ]);

  const activeMonths = Math.max(1, activeMonthRows[0]?.months ?? 0);
  const categories: BudgetCategorySpend[] = spendRows
    .map((row) => ({
      category: row.category,
      thisMonthMinorUnits: row.thisMonth,
      averageMonthlyMinorUnits: Math.round(row.history / activeMonths),
    }))
    .sort(
      (left, right) =>
        right.averageMonthlyMinorUnits - left.averageMonthlyMinorUnits ||
        right.thisMonthMinorUnits - left.thisMonthMinorUnits ||
        left.category.localeCompare(right.category),
    );

  return { currency: query.currency, monthStart, monthEnd, budgets, categories };
}

export function queryBudgetOverview(query: BudgetOverviewQuery): Promise<BudgetOverview> {
  return readConsistentSnapshot(() => queryBudgetOverviewUnsafe(query));
}

/** Sets (or, with a null limit, removes) one category's monthly budget. */
export async function saveCategoryBudget(input: CategoryBudgetInput): Promise<void> {
  const category = input.category.trim();
  if (!category) throw new Error("A budget needs a category.");
  const limit = input.monthlyLimitMinorUnits;
  if (limit !== null && (!Number.isSafeInteger(limit) || limit <= 0)) {
    throw new Error(`A budget limit must be a positive whole amount, got ${limit}`);
  }
  const key = { category, currency: input.currency };
  writeDb().transaction((tx) => {
    if (limit === null) {
      tx.delete(categoryBudgets)
        .where(and(eq(categoryBudgets.category, category), eq(categoryBudgets.currency, input.currency)))
        .run();
      clearBudgetAlert(tx, key);
      return;
    }
    const updatedAt = Date.now();
    tx.insert(categoryBudgets)
      .values({ ...key, monthlyLimitMinorUnits: limit, updatedAt })
      .onConflictDoUpdate({
        target: [categoryBudgets.category, categoryBudgets.currency],
        set: { monthlyLimitMinorUnits: limit, updatedAt },
      })
      .run();
    // Alerts start from where the budget stands now (see budget-alerts.ts).
    resetBudgetAlertBaseline(tx, { ...key, limitMinorUnits: limit }, updatedAt);
  });
  // Live queries re-read: the Budgets screen and Home's card update at once.
  notifyDataChanged();
}
