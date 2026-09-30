// Budget alert bookkeeping: which budgets crossed 85% / 100% since they last
// notified this month. Read and recorded in ONE writer transaction, so two
// syncs finishing close together can't both announce the same crossing.
import { and, eq, sql } from "drizzle-orm";

import {
  budgetAlertLevel,
  newBudgetAlerts,
  type BudgetAlert,
  type BudgetAlertCandidate,
  type BudgetAlertLevel,
} from "../lib/budget-alerts";
import type { Database } from "./client.native";
import { writeDb } from "./connection";
import { budgetAlerts } from "./schema";

function monthRange(at: number): { monthStart: number; monthEnd: number } {
  const date = new Date(at);
  return {
    monthStart: new Date(date.getFullYear(), date.getMonth(), 1).getTime(),
    monthEnd: new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime(),
  };
}

function toLevel(value: number | null): BudgetAlertLevel {
  return value === 100 ? 100 : value === 85 ? 85 : 0;
}

type AlertWriter = Pick<Database, "all" | "insert" | "delete" | "transaction">;

function recordLevel(
  database: Pick<Database, "insert">,
  key: { category: string; currency: string },
  monthStart: number,
  level: BudgetAlertLevel,
): void {
  database
    .insert(budgetAlerts)
    .values({ ...key, monthStart, level })
    .onConflictDoUpdate({
      target: [budgetAlerts.category, budgetAlerts.currency],
      set: { monthStart, level },
    })
    .run();
}

/**
 * Budgets (every currency) that crossed a new level this month, recorded as
 * alerted before returning — the caller only has to show them.
 */
export function collectBudgetAlerts(
  at: number = Date.now(),
  database: AlertWriter = writeDb(),
): BudgetAlert[] {
  const { monthStart, monthEnd } = monthRange(at);
  return database.transaction((tx) => {
    const rows = tx.all<Omit<BudgetAlertCandidate, "alertedLevel"> & { alertedLevel: number | null }>(sql`
      SELECT b.category AS category,
             b.currency AS currency,
             b.monthly_limit_minor_units AS limitMinorUnits,
             COALESCE((
               SELECT SUM(t.amount_minor_units) FROM transactions t
               WHERE t.currency = b.currency AND t.category = b.category
                 AND t.direction = 'expense' AND t.date >= ${monthStart} AND t.date < ${monthEnd}
             ), 0) AS spentMinorUnits,
             CASE WHEN a.month_start = ${monthStart} THEN a.level END AS alertedLevel
      FROM category_budgets b
      LEFT JOIN budget_alerts a ON a.category = b.category AND a.currency = b.currency
    `);
    const alerts = newBudgetAlerts(
      rows.map((row) => ({ ...row, alertedLevel: toLevel(row.alertedLevel) })),
    );
    for (const alert of alerts) recordLevel(tx, alert, monthStart, alert.level);
    return alerts;
  });
}

/**
 * After the user sets a limit: record where the budget already stands, so
 * setting ₹5,000 on a category already at ₹6,000 doesn't immediately
 * announce "over budget" — only a crossing from here on notifies. Raising a
 * limit lowers the recorded level, so a later crossing alerts again.
 */
export function resetBudgetAlertBaseline(
  database: Pick<Database, "all" | "insert">,
  input: { category: string; currency: string; limitMinorUnits: number },
  at: number = Date.now(),
): void {
  const { monthStart, monthEnd } = monthRange(at);
  const [row] = database.all<{ spent: number }>(sql`
    SELECT COALESCE(SUM(amount_minor_units), 0) AS spent FROM transactions
    WHERE currency = ${input.currency} AND category = ${input.category}
      AND direction = 'expense' AND date >= ${monthStart} AND date < ${monthEnd}
  `);
  recordLevel(
    database,
    input,
    monthStart,
    budgetAlertLevel(row?.spent ?? 0, input.limitMinorUnits),
  );
}

export function clearBudgetAlert(
  database: Pick<Database, "delete">,
  key: { category: string; currency: string },
): void {
  database
    .delete(budgetAlerts)
    .where(and(eq(budgetAlerts.category, key.category), eq(budgetAlerts.currency, key.currency)))
    .run();
}
