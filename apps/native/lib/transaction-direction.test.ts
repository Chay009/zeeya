import { describe, it, expect } from "vitest";
import { trxDirection } from "./transaction-direction";

// trxDirection is the single source of truth dashboard totals and the
// Recent list's sign both read from — previously two independently
// hardcoded lists that had already drifted apart (TRANSFER/RECHARGE/
// INVESTMENT were expenses in neither).
describe("trxDirection", () => {
  it("classifies every debit-shaped type as an expense", () => {
    for (const type of [
      "EXPENSE",
      "AUTO_DEBIT",
      "WALLET_DEBIT",
      "ATM_WITHDRAWAL",
      "TRANSFER",
      "RECHARGE",
      "INVESTMENT",
    ] as const) {
      expect(trxDirection(type)).toBe("expense");
    }
  });

  it("classifies credit-shaped types as income", () => {
    expect(trxDirection("INCOME")).toBe("income");
    expect(trxDirection("SALARY")).toBe("income");
  });

  it("treats a wallet top-up as neutral, not income", () => {
    expect(trxDirection("WALLET_CREDIT")).toBe("neutral");
  });

  it("treats a balance-only notice and null as neutral", () => {
    expect(trxDirection("BALANCE_UPDATE")).toBe("neutral");
    expect(trxDirection(null)).toBe("neutral");
  });
});
