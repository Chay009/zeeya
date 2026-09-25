import { describe, expect, it } from "vitest";

import { transactionMatchesFilter } from "./analytics-transaction-filters";
import type { InsightsTransactionRow } from "./insights-transaction-presentation";

function row(overrides: Partial<InsightsTransactionRow> = {}): InsightsTransactionRow {
  return {
    key: "txn-1",
    name: "Swiggy",
    sub: "Today · 1:24 PM",
    amount: "- ₹ 468",
    date: Date.UTC(2026, 8, 22, 8, 0),
    monthGroup: "September 2026",
    category: "food",
    letter: "S",
    tile: "#fff",
    ink: "#000",
    img: null,
    ...overrides,
  };
}

describe("transactionMatchesFilter", () => {
  it("matches food merchants and categories", () => {
    expect(transactionMatchesFilter(row(), "Food")).toBe(true);
    expect(transactionMatchesFilter(row({ name: "Uber", category: "transport" }), "Food")).toBe(
      false,
    );
  });

  it("matches all transactions for the All chip", () => {
    expect(transactionMatchesFilter(row({ name: "Uber", category: "transport" }), "All")).toBe(true);
  });
});
