import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import {
  TRANSACTION_NOTIFICATION_CATEGORY,
  VIEW_TRANSACTIONS_ACTION,
} from "@/integrations/shared/notifications/transaction-notification";
import { postTransactionNotification } from "@/integrations/shared/notifications/post-transaction-notification";

const TRANSACTION_CHANNEL_ID = "financial-activity";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureTransactionChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(TRANSACTION_CHANNEL_ID, {
    name: "Financial activity",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

async function ensureTransactionNotificationCategory(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(TRANSACTION_NOTIFICATION_CATEGORY, [
    {
      identifier: VIEW_TRANSACTIONS_ACTION,
      buttonTitle: "View transactions",
      options: { opensAppToForeground: true },
    },
  ]);
}

export async function requestTransactionNotificationPermission(): Promise<boolean> {
  await ensureTransactionChannel();
  await ensureTransactionNotificationCategory();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

// The notice carries only a count — never merchant, amount or SMS content —
// so it is safe on a lock screen.
export async function notifyNewFinancialTransactions(count: number): Promise<void> {
  if (count <= 0) return;
  await ensureTransactionChannel();
  await ensureTransactionNotificationCategory();

  await postTransactionNotification(count, TRANSACTION_CHANNEL_ID);
}
