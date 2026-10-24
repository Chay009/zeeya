import plist from "@expo/plist";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TRANSACTION_NOTIFICATION_CATEGORY } from "@/integrations/shared/notifications/transaction-notification";

const notifications = vi.hoisted(() => ({
  setNotificationHandler: vi.fn(),
  setNotificationChannelAsync: vi.fn().mockResolvedValue(undefined),
  setNotificationCategoryAsync: vi.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: vi.fn().mockResolvedValue("notification-id"),
  getPermissionsAsync: vi.fn().mockResolvedValue({ granted: true }),
  requestPermissionsAsync: vi.fn().mockResolvedValue({ granted: true }),
  postCustom: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("expo-notifications", () => ({
  ...notifications,
  AndroidImportance: { DEFAULT: 3 },
  AndroidNotificationVisibility: { PRIVATE: 0 },
}));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("expo-widgets", () => ({
  createCustomNotification: vi.fn(() => ({ post: notifications.postCustom })),
}));
vi.mock("@expo/ui/jetpack-compose", () => ({ Column: "Column", Text: "Text" }));
vi.mock("@expo/ui/jetpack-compose/modifiers", () => ({ paddingAll: (value: number) => value }));
vi.mock(
  "@/integrations/shared/notifications/post-transaction-notification",
  async () => import("@/integrations/android/notifications/transaction-notification"),
);

import { notifyNewFinancialTransactions } from "./notifications.native";
import { postTransactionNotification as postAppleNotification } from "@/integrations/apple/notifications/transaction-notification";

describe("financial transaction notification", () => {
  beforeEach(() => vi.clearAllMocks());

  it("registers the channel and posts a count-only SDK 58 custom Android notification", async () => {
    await notifyNewFinancialTransactions(2);

    expect(notifications.setNotificationCategoryAsync).toHaveBeenCalledWith("financialactivity", [
      {
        identifier: "viewtransactions",
        buttonTitle: "View transactions",
        options: { opensAppToForeground: true },
      },
    ]);
    expect(notifications.postCustom).toHaveBeenCalledWith(
      { count: 2 },
      {
        id: "zeeya-financial-activity",
        channelId: "financial-activity",
        title: "New transactions detected",
        text: "2 new transactions were added to Zeeya.",
        url: "zeeya://activity",
        ongoing: false,
        autoCancel: true,
      },
    );
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(notifications.setNotificationChannelAsync.mock.invocationCallOrder[0]).toBeLessThan(
      notifications.postCustom.mock.invocationCallOrder[0],
    );
  });

  it("keeps Apple's content extension category and native tap routing", async () => {
    await postAppleNotification(2, "financial-activity");
    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: {
        title: "New transactions detected",
        body: "2 new transactions were added to Zeeya.",
        data: { route: "/(tabs)/activity" },
        categoryIdentifier: "financialactivity",
      },
      trigger: null,
    });
    expect(notifications.postCustom).not.toHaveBeenCalled();
  });

  it("does nothing for zero new transactions", async () => {
    await notifyNewFinancialTransactions(0);
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(notifications.postCustom).not.toHaveBeenCalled();
  });

  it("routes the iOS expanded notification target with the exact registered category", () => {
    const infoPlist = plist.parse(
      readFileSync(
        path.join(__dirname, "../../../targets/apple/transaction-notification/Info.plist"),
        "utf8",
      ),
    );
    expect(infoPlist).toMatchObject({
      NSExtension: {
        NSExtensionAttributes: {
          UNNotificationExtensionCategory: TRANSACTION_NOTIFICATION_CATEGORY,
        },
        NSExtensionPointIdentifier: "com.apple.usernotifications.content-extension",
      },
    });
  });
});
