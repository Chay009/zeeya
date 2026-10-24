import * as Notifications from "expo-notifications";

import {
  TRANSACTION_NOTIFICATION_CATEGORY,
  TRANSACTIONS_ROUTE,
} from "../../shared/notifications/transaction-notification";

// iOS custom expanded presentation belongs to the notification-content target.
export async function postTransactionNotification(
  count: number,
  _channelId: string,
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: count === 1 ? "New transaction detected" : "New transactions detected",
      body: `${count} new ${count === 1 ? "transaction was" : "transactions were"} added to Zeeya.`,
      data: { route: TRANSACTIONS_ROUTE },
      categoryIdentifier: TRANSACTION_NOTIFICATION_CATEGORY,
    },
    trigger: null,
  });
}
