import { describe, expect, it } from "vitest";

import { toOverviewWidgetSnapshot } from "./overview-snapshot";

describe("WidgetKit snapshot privacy boundary", () => {
  it("publishes only complete-table counts, never account or merchant detail", () => {
    const model = {
      accounts: [{ bankName: "PRIVATE BANK" }, { bankName: "ANOTHER PRIVATE BANK" }],
      subscriptionOverview: {
        activeCount: 24,
        items: [{ merchant: "PRIVATE MERCHANT" }],
      },
    };

    const snapshot = toOverviewWidgetSnapshot(model, 1792368000000);

    expect(snapshot).toEqual({
      accountCount: 2,
      activeSubscriptionCount: 24,
      updatedAt: 1792368000000,
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/PRIVATE|MERCHANT/);
  });
});
