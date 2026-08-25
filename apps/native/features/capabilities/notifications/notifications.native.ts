import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import type { ParsedSms } from "@/lib/sms";

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

export async function requestTransactionNotificationPermission(): Promise<boolean> {
  await ensureTransactionChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function notifyNewFinancialTransactions(messages: ParsedSms[]): Promise<void> {
  if (messages.length === 0) return;
  await ensureTransactionChannel();

  const count = messages.length;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: count === 1 ? "New transaction detected" : "New transactions detected",
      body:
        count === 1
          ? "1 new transaction was added to Zeeya."
          : `${count} new transactions were added to Zeeya.`,
      data: { route: "/" },
    },
    trigger: Platform.OS === "android" ? { channelId: TRANSACTION_CHANNEL_ID } : null,
  });
}
