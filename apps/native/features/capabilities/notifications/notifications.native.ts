import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

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

// The notice carries only a count — never merchant, amount or SMS content —
// so it is safe on a lock screen.
export async function notifyNewFinancialTransactions(count: number): Promise<void> {
  if (count <= 0) return;
  await ensureTransactionChannel();

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
