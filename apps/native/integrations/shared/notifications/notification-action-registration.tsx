import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";

import { isTransactionNotificationResponse, TRANSACTIONS_ROUTE } from "./transaction-notification";

export function NotificationActionRegistration() {
  const router = useRouter();
  const lastHandled = useRef<string | null>(null);

  useEffect(() => {
    function handle(response: Notifications.NotificationResponse) {
      if (!isTransactionNotificationResponse(response)) return;
      const responseKey = `${response.notification.request.identifier}:${response.actionIdentifier}`;
      if (lastHandled.current === responseKey) return;
      lastHandled.current = responseKey;
      Notifications.clearLastNotificationResponse();
      router.navigate(TRANSACTIONS_ROUTE);
    }

    try {
      const lastResponse = Notifications.getLastNotificationResponse();
      if (lastResponse) handle(lastResponse);
    } catch (error) {
      console.warn("Could not inspect the last notification response", error);
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(handle);
    return () => subscription.remove();
  }, [router]);

  return null;
}
