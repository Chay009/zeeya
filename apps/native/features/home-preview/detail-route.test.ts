// Tests the pure routing helper used by the read-model activity section's
// row tap — a financial message (one that has a matching transactions row)
// routes to the new lightweight /transaction-detail/[id] route, while
// any other message (non-financial) routes to /activity-detail/[id].
// Both routes read from the SQL-backed FinanceDataSource, distinct from
// the legacy parser-dump /transaction/[id] route (which still exists for
// the 6 non-Home callers until Phase 1C replaces them).
import { describe, expect, it } from "vitest";

import { buildActivityDetailRoute } from "./detail-route";

describe("buildActivityDetailRoute", () => {
  it("routes a financial transaction-kind item to /transaction-detail/[id]", () => {
    const route = buildActivityDetailRoute({
      key: "activity:abc",
      letter: "N",
      tile: "#fff",
      ink: "#000",
      bar: "#0f0",
      name: "Netflix",
      sub: "Today",
      amount: "−₹199",
      direction: "expense",
      categoryFilters: ["GRM_BANK"],
      categorySuggestions: [],
      pills: [],
      detailTarget: { kind: "transaction", id: "txn-123" },
      date: 1_700_000_000_000,
      amountMinorUnits: 19_900,
      currency: "INR",
      bankName: "HDFC Bank",
      accountId: "hdfc bank|1234",
    });
    expect(route).toEqual({
      pathname: "/transaction-detail/[id]",
      params: { id: "txn-123" },
    });
  });

  it("routes a non-financial activity-kind item to /activity-detail/[id]", () => {
    const route = buildActivityDetailRoute({
      key: "activity:delivery-1",
      letter: "D",
      tile: "#fff",
      ink: "#000",
      bar: "#0f0",
      name: "Delivery",
      sub: "Today",
      amount: null,
      direction: "neutral",
      categoryFilters: ["GRM_DELIVERY"],
      categorySuggestions: [],
      pills: [],
      detailTarget: { kind: "activity", id: "delivery-1|GRM_DELIVERY" },
      date: 1_700_000_000_000,
      amountMinorUnits: null,
      currency: null,
      bankName: null,
      accountId: null,
    });
    expect(route).toEqual({
      pathname: "/activity-detail/[id]",
      params: { id: "delivery-1|GRM_DELIVERY" },
    });
  });
});
