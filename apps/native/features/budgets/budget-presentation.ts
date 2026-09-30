// What the budget surfaces show, derived from one BudgetOverview. Pure, so
// the rules (pace, summary, suggestions) are tested without a screen.
import { BUDGET_WATCH_SHARE } from "@/lib/budget-alerts";
import { minorUnitExponent, toMinorUnits } from "@/lib/currency";
import type { BudgetCategorySpend, BudgetOverview } from "@/lib/dashboard-data";

/**
 * over     — spent more than the limit.
 * watch    — 85% used, or clearly ahead of how far the month has run.
 * on-track — everything else.
 */
export type BudgetPace = "over" | "watch" | "on-track";

export interface BudgetRowView {
  category: string;
  limitMinorUnits: number;
  spentMinorUnits: number;
  /** spent / limit; above 1 when over. */
  used: number;
  /** limit − spent; negative when over. */
  remainingMinorUnits: number;
  pace: BudgetPace;
}

export interface BudgetSummaryView {
  count: number;
  limitMinorUnits: number;
  spentMinorUnits: number;
  used: number;
  overCount: number;
  watchCount: number;
}

const WATCH_USED = BUDGET_WATCH_SHARE;
// "Clearly ahead": spent 15% more than an even pace would have by now.
const AHEAD_OF_PACE = 1.15;

/** How far through the month `at` is, 0..1. */
export function monthElapsed(overview: Pick<BudgetOverview, "monthStart" | "monthEnd">, at: number) {
  const span = overview.monthEnd - overview.monthStart;
  return Math.min(1, Math.max(0, (at - overview.monthStart) / span));
}

export function budgetPace(spent: number, limit: number, elapsed: number): BudgetPace {
  if (spent > limit) return "over";
  const used = spent / limit;
  if (used >= WATCH_USED) return "watch";
  // Early in the month one purchase is "ahead of pace" by definition; only
  // judge pace once a few days have run.
  if (elapsed >= 0.1 && spent > limit * elapsed * AHEAD_OF_PACE) return "watch";
  return "on-track";
}

const PACE_ORDER: Record<BudgetPace, number> = { over: 0, watch: 1, "on-track": 2 };

/** Budgets, most urgent first (over, then watch, then by share used). */
export function budgetRows(overview: BudgetOverview, at: number): BudgetRowView[] {
  const elapsed = monthElapsed(overview, at);
  return overview.budgets
    .map((budget) => ({
      category: budget.category,
      limitMinorUnits: budget.limitMinorUnits,
      spentMinorUnits: budget.spentMinorUnits,
      used: budget.spentMinorUnits / budget.limitMinorUnits,
      remainingMinorUnits: budget.limitMinorUnits - budget.spentMinorUnits,
      pace: budgetPace(budget.spentMinorUnits, budget.limitMinorUnits, elapsed),
    }))
    .sort(
      (left, right) =>
        PACE_ORDER[left.pace] - PACE_ORDER[right.pace] ||
        right.used - left.used ||
        left.category.localeCompare(right.category),
    );
}

/** Totals across the budgeted categories only — never all spending. */
export function budgetSummary(rows: readonly BudgetRowView[]): BudgetSummaryView | null {
  if (rows.length === 0) return null;
  const limitMinorUnits = rows.reduce((total, row) => total + row.limitMinorUnits, 0);
  const spentMinorUnits = rows.reduce((total, row) => total + row.spentMinorUnits, 0);
  return {
    count: rows.length,
    limitMinorUnits,
    spentMinorUnits,
    used: spentMinorUnits / limitMinorUnits,
    overCount: rows.filter((row) => row.pace === "over").length,
    watchCount: rows.filter((row) => row.pace === "watch").length,
  };
}

/** Categories the user spends in that don't have a budget yet. */
export function unbudgetedCategories(overview: BudgetOverview): BudgetCategorySpend[] {
  const budgeted = new Set(overview.budgets.map((budget) => budget.category));
  return overview.categories.filter((category) => !budgeted.has(category.category));
}

/**
 * A round limit near typical spend: the monthly average (or, with no
 * history, this month so far) rounded UP to a step that reads naturally —
 * ₹100 under ₹1,000, ₹500 under ₹10,000, then ₹1,000. Null with no spend.
 */
export function suggestedLimitMinorUnits(
  spend: Pick<BudgetCategorySpend, "averageMonthlyMinorUnits" | "thisMonthMinorUnits">,
  currency: string,
): number | null {
  const basis = spend.averageMonthlyMinorUnits || spend.thisMonthMinorUnits;
  if (basis <= 0) return null;
  const unit = 10 ** minorUnitExponent(currency);
  const major = basis / unit;
  const step = major < 1_000 ? 100 : major < 10_000 ? 500 : 1_000;
  return Math.ceil(major / step) * step * unit;
}

/**
 * Parses what the user typed ("8000", "8,000", "8000.50") into minor units,
 * exactly (no floating point). Null for anything that isn't a positive amount.
 */
export function parseLimitInput(text: string, currency: string): number | null {
  const cleaned = text.trim().replace(/[^\d.,]/g, "");
  if (!cleaned) return null;
  try {
    const value = toMinorUnits(cleaned.replace(/,/g, ""), currency);
    return value > 0 ? value : null;
  } catch {
    return null;
  }
}
