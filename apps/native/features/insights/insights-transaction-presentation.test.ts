import { describe, expect, it } from "vitest";

import type { TransactionSummary } from "@/lib/dashboard-data";

import { mapInsightsTransactionRow } from "./insights-transaction-presentation";

function summary(overrides: Partial<TransactionSummary> = {}): TransactionSummary {
  return {
    id: "txn-1",
    date: Date.UTC(2026, 8, 18, 5, 0),
    amountMinorUnits: 42_000,
    currency: "INR",
    direction: "expense",
    accountId: "acct-1",
    trxTypeRich: "EXPENSE",
    vendor: "Swiggy",
    brandName: "Swiggy",
    category: "food",
    ref: null,
    bankName: "HDFC Bank",
    mandateId: null,
    ...overrides,
  };
}

describe("mapInsightsTransactionRow", () => {
  it("maps only the fields the transaction rows render", () => {
    const row = mapInsightsTransactionRow(summary());
    expect(row).toMatchObject({
      key: "txn-1",
      name: "Swiggy",
      amount: "- ₹ 420",
      monthGroup: "September 2026",
      category: "food",
      letter: "S",
      amountValue: 420,
      currency: "INR",
      direction: "expense",
    });
    expect(row).not.toHaveProperty("raw");
    expect(row).not.toHaveProperty("trxTypeRich");
  });

  it("formats income rows with a positive prefix", () => {
    const row = mapInsightsTransactionRow(summary({ direction: "income" }));
    expect(row.amount).toBe("+ ₹ 420");
  });
});
