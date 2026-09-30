import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { budgetAlertMessage, type BudgetAlert } from "@/lib/budget-alerts";

// Budget alerts have their own Android channel, so they can be muted apart
// from new-transaction notices. Like those, the text names only categories
// and levels — never amounts — and stays hidden on a locked screen.
const BUDGET_CHANNEL_ID = "budget-alerts";
export const BUDGET_ALERT_KIND = "budget-alert";

async function ensureBudgetChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(BUDGET_CHANNEL_ID, {
    name: "Budget alerts",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

/** Asks once (when the user first sets a budget); true if alerts can show. */
export async function requestBudgetAlertPermission(): Promise<boolean> {
  await ensureBudgetChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** Shows one notification for the budgets that just crossed a level. */
export async function notifyBudgetAlerts(alerts: readonly BudgetAlert[]): Promise<void> {
  const message = budgetAlertMessage(alerts);
  if (!message) return;
  // Never prompts from a sync: without permission the alert is dropped
  // (it's already recorded, so it won't pile up for later).
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  await ensureBudgetChannel();
  await Notifications.scheduleNotificationAsync({
    content: { ...message, data: { kind: BUDGET_ALERT_KIND } },
    trigger: Platform.OS === "android" ? { channelId: BUDGET_CHANNEL_ID } : null,
  });
}

export function isBudgetAlertResponse(response: Notifications.NotificationResponse): boolean {
  return response.notification.request.content.data?.kind === BUDGET_ALERT_KIND;
}
