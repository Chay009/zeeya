import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";

import { isBudgetAlertResponse } from "../budget-notifications";
import { BUDGETS_ROUTE } from "../routes";

/**
 * Opens Budgets when a budget alert is tapped — including the tap that
 * launched the app. An effect because it subscribes to an external event
 * source (the notification system), which is what effects are for.
 */
export function BudgetAlertResponder() {
  const router = useRouter();
  const lastHandled = useRef<string | null>(null);

  useEffect(() => {
    function handle(response: Notifications.NotificationResponse) {
      if (!isBudgetAlertResponse(response)) return;
      const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
      if (lastHandled.current === key) return;
      lastHandled.current = key;
      // Otherwise a later ordinary launch could replay this tap.
      Notifications.clearLastNotificationResponse();
      router.push(BUDGETS_ROUTE);
    }

    try {
      const last = Notifications.getLastNotificationResponse();
      if (last) handle(last);
    } catch (cause) {
      console.warn("Could not inspect the last notification response", cause);
    }
    const subscription = Notifications.addNotificationResponseReceivedListener(handle);
    return () => subscription.remove();
  }, [router]);

  return null;
}
