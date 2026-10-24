import { describe, expect, it } from "vitest";

import {
  isTransactionNotificationResponse,
  TRANSACTION_NOTIFICATION_CATEGORY,
  VIEW_TRANSACTIONS_ACTION,
} from "./transaction-notification";

function response(categoryIdentifier: string | null, actionIdentifier: string) {
  return { actionIdentifier, notification: { request: { content: { categoryIdentifier } } } };
}

describe("transaction notification routing", () => {
  it("accepts the explicit View action and a normal notification tap", () => {
    expect(
      isTransactionNotificationResponse(
        response(TRANSACTION_NOTIFICATION_CATEGORY, VIEW_TRANSACTIONS_ACTION),
      ),
    ).toBe(true);
    expect(
      isTransactionNotificationResponse(
        response(TRANSACTION_NOTIFICATION_CATEGORY, "expo.modules.notifications.actions.DEFAULT"),
      ),
    ).toBe(true);
  });

  it("ignores unrelated notifications and actions", () => {
    expect(isTransactionNotificationResponse(response(null, VIEW_TRANSACTIONS_ACTION))).toBe(false);
    expect(
      isTransactionNotificationResponse(response(TRANSACTION_NOTIFICATION_CATEGORY, "dismiss")),
    ).toBe(false);
  });
});
