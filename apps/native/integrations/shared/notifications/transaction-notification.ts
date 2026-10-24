export const TRANSACTION_NOTIFICATION_CATEGORY = "financialactivity";
export const VIEW_TRANSACTIONS_ACTION = "viewtransactions";
export const TRANSACTIONS_ROUTE = "/(tabs)/activity";

export function isTransactionNotificationResponse(response: {
  actionIdentifier: string;
  notification: { request: { content: { categoryIdentifier?: string | null } } };
}): boolean {
  return (
    response.notification.request.content.categoryIdentifier ===
      TRANSACTION_NOTIFICATION_CATEGORY &&
    (response.actionIdentifier === VIEW_TRANSACTIONS_ACTION ||
      response.actionIdentifier === "expo.modules.notifications.actions.DEFAULT")
  );
}
