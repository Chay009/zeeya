import { describe, expect, it } from "vitest";

import type { HomeHighlights } from "@/lib/dashboard-data";

import { hasHomeHighlightsData } from "./home-highlights-presentation";

function emptyHighlights(): HomeHighlights {
  return {
    currency: "USD",
    today: {
      incomeMinorUnits: 0,
      spendingMinorUnits: 0,
      netMinorUnits: 0,
      transactionCount: 0,
      recent: [],
      largestTransaction: null,
    },
    subscriptions: {
      activeCount: 0,
      likelyCount: 0,
      expectedMonthlyMinorUnits: 0,
      spentThisMonthMinorUnits: 0,
      nextPayment: null,
    },
    upcomingPaymentCount: 0,
    upcomingPaymentsTotalMinorUnits: 0,
    upcomingPayments: [],
  };
}

describe("hasHomeHighlightsData", () => {
  it("returns false for an empty highlight snapshot", () => {
    expect(hasHomeHighlightsData(emptyHighlights())).toBe(false);
  });

  it("recognizes a largest transaction or upcoming estimate as real highlight data", () => {
    const source = emptyHighlights();
    source.today.largestTransaction = {
      id: "transaction-1",
      date: 1,
      amountMinorUnits: 2_500,
      currency: "USD",
      direction: "expense",
      accountId: null,
      trxTypeRich: null,
      vendor: "Market",
      brandName: null,
      category: "Shopping",
      ref: null,
      bankName: null,
      mandateId: null,
    };
    expect(hasHomeHighlightsData(source)).toBe(true);
  });
});
