// When a budget deserves a notification. Pure, shared by the alert check
// (db/budget-alerts.ts) and the Budgets screen's "watch" state, so the two
// can never disagree about what 85% means.

/** Share of a limit at which a budget turns "watch" and alerts once. */
export const BUDGET_WATCH_SHARE = 0.85;

/** 0 = fine, 85 = nearing the limit, 100 = over it. */
export type BudgetAlertLevel = 0 | 85 | 100;

export function budgetAlertLevel(spentMinorUnits: number, limitMinorUnits: number): BudgetAlertLevel {
  if (spentMinorUnits > limitMinorUnits) return 100;
  if (spentMinorUnits >= limitMinorUnits * BUDGET_WATCH_SHARE) return 85;
  return 0;
}

export interface BudgetAlert {
  category: string;
  currency: string;
  level: 85 | 100;
}

export interface BudgetAlertCandidate {
  category: string;
  currency: string;
  limitMinorUnits: number;
  spentMinorUnits: number;
  /** The level already alerted THIS month (0 when none, or last month's). */
  alertedLevel: BudgetAlertLevel;
}

/** Budgets that crossed a new level since their last alert this month. */
export function newBudgetAlerts(candidates: readonly BudgetAlertCandidate[]): BudgetAlert[] {
  const alerts: BudgetAlert[] = [];
  for (const candidate of candidates) {
    const level = budgetAlertLevel(candidate.spentMinorUnits, candidate.limitMinorUnits);
    if (level > candidate.alertedLevel && level !== 0) {
      alerts.push({ category: candidate.category, currency: candidate.currency, level });
    }
  }
  return alerts;
}

/**
 * One notification for however many budgets crossed a level — names and
 * levels only, never amounts, so it stays privacy-safe like the others.
 */
export function budgetAlertMessage(alerts: readonly BudgetAlert[]): { title: string; body: string } | null {
  if (alerts.length === 0) return null;
  const over = alerts.filter((alert) => alert.level === 100).map((alert) => alert.category);
  const near = alerts.filter((alert) => alert.level === 85).map((alert) => alert.category);
  if (alerts.length === 1) {
    const [alert] = alerts;
    return alert!.level === 100
      ? { title: "Over budget", body: `${alert!.category} is over its monthly budget.` }
      : { title: "Budget alert", body: `${alert!.category} is at 85% of its monthly budget.` };
  }
  const parts = [
    over.length > 0 ? `Over budget: ${listNames(over)}.` : null,
    near.length > 0 ? `Nearing the limit: ${listNames(near)}.` : null,
  ].filter(Boolean);
  return {
    title: over.length > 0 ? `${alerts.length} budgets need attention` : "Budgets nearing their limit",
    body: parts.join(" "),
  };
}

function listNames(names: readonly string[]): string {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
