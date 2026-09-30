import { collectBudgetAlerts } from "@/db/budget-alerts";

import { notifyBudgetAlerts } from "./budget-notifications";

/**
 * Run after every sync (foreground and background): notify any budget that
 * just crossed 85% / 100% this month. Never throws — a budget alert must not
 * fail or retry the sync that triggered it.
 */
export async function checkBudgetAlerts(at: number = Date.now()): Promise<void> {
  try {
    const alerts = collectBudgetAlerts(at);
    if (alerts.length > 0) await notifyBudgetAlerts(alerts);
  } catch (cause) {
    console.warn("Zeeya could not check budget alerts", cause);
  }
}
