/** Counts and refresh time are the only data published outside the authenticated app. */
export interface OverviewWidgetSnapshot {
  accountCount: number;
  activeSubscriptionCount: number;
  updatedAt: number | null;
}

export const INITIAL_OVERVIEW_SNAPSHOT: OverviewWidgetSnapshot = {
  accountCount: 0,
  activeSubscriptionCount: 0,
  updatedAt: null,
};

export function toOverviewWidgetSnapshot(
  model: {
    accounts: readonly unknown[];
    subscriptionOverview: { activeCount: number };
  },
  at: number = Date.now(),
): OverviewWidgetSnapshot {
  return {
    accountCount: model.accounts.length,
    activeSubscriptionCount: model.subscriptionOverview.activeCount,
    updatedAt: at,
  };
}
