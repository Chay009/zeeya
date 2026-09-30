import type { BudgetAlert } from "@/lib/budget-alerts";

// No local notifications (or budgets data) on web.
export const BUDGET_ALERT_KIND = "budget-alert";

export async function requestBudgetAlertPermission(): Promise<boolean> {
  return false;
}

export async function notifyBudgetAlerts(_alerts: readonly BudgetAlert[]): Promise<void> {}

export function isBudgetAlertResponse(_response: unknown): boolean {
  return false;
}
