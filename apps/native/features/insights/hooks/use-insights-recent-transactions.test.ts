import { describe, expect, it } from "vitest";

import type { TransactionSummary } from "@/lib/dashboard-data";

import { normalizeInsightsTransactionRows } from "../insights-transaction-presentation";

describe("normalizeInsightsTransactionRows", () => {
  it("maps raw SQL transaction summaries into analytics row keys", () => {
    const raw: TransactionSummary = {
      id: "sms-1|expense",
      date: 1_700_000_000_000,
      amountMinorUnits: 12_500,
      currency: "INR",
      direction: "expense",
      accountId: null,
      trxTypeRich: null,
      vendor: "Swiggy",
      brandName: "Swiggy",
      category: "Food",
      ref: null,
      bankName: "HDFC",
      mandateId: null,
    };

    const [row] = normalizeInsightsTransactionRows([raw]);

    expect(row.key).toBe("sms-1|expense");
    expect(row.name).toBe("Swiggy");
    expect(row.amount).toContain("125");
  });

  it("keeps already-mapped analytics rows untouched", () => {
    const mapped = {
      key: "sms-2|expense",
      name: "Amazon",
      sub: "Today",
      amount: "- ₹499",
      date: 1,
      monthGroup: "September 2026",
      category: "Shopping",
      letter: "A",
      tile: "#fff",
      ink: "#000",
      img: null,
    };

    expect(normalizeInsightsTransactionRows([mapped])).toEqual([mapped]);
  });
});
