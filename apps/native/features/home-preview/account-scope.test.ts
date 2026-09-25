import { describe, expect, it } from "vitest";

import type { HomeAccount } from "./data";
import {
  ALL_ACCOUNTS_KEY,
  accountScopeCaption,
  bankShortName,
  last4Label,
  resolveScopedAccountId,
  scopedHeroBalance,
} from "./account-scope";

function account(overrides: Partial<HomeAccount> & Pick<HomeAccount, "key" | "id" | "bankName" | "last4">): HomeAccount {
  return {
    bankIcon: undefined,
    bankColor: "#000",
    status: "CONFIRMED",
    balance: "₹1,000",
    balanceMinorUnits: 100_000,
    currency: "INR",
    netAcross: "₹9,000",
    balanceMeta: null,
    reportedBalance: null,
    reportedMeta: null,
    capturedIncome: null,
    capturedExpense: null,
    capturedChange: null,
    capturedTransactionCount: 0,
    reconciliation: null,
    unassignedNote: null,
    ...overrides,
  };
}

describe("account scope", () => {
  it("shortens bank names and last4 without inventing digits", () => {
    expect(bankShortName("HDFC Bank")).toBe("HDFC");
    expect(last4Label("1234")).toBe("••1234");
    expect(last4Label("xx")).toBe("xx");
  });

  it("uses the selected account balance, otherwise sums confirmed balances", () => {
    const accounts = [
      account({
        id: "hdfc bank|1111",
        key: "a",
        bankName: "HDFC Bank",
        last4: "1111",
        balance: "₹100",
        balanceMinorUnits: 10_000,
      }),
      account({
        id: "sbi|2222",
        key: "b",
        bankName: "SBI",
        last4: "2222",
        balance: "₹200",
        balanceMinorUnits: 20_000,
      }),
    ];
    expect(scopedHeroBalance(accounts, "a")).toBe("₹100");
    expect(scopedHeroBalance(accounts, ALL_ACCOUNTS_KEY)).toBe("₹300");
    expect(accountScopeCaption(accounts, "b")).toContain("SBI");
  });

  it("resolves SQL account ids from presentation keys", () => {
    const accounts = [
      account({ id: "hdfc bank|1111", key: "hdfc-1", bankName: "HDFC Bank", last4: "1111" }),
      account({ id: "sbi|3333", key: "sbi", bankName: "SBI", last4: "3333" }),
    ];
    expect(resolveScopedAccountId(accounts, ALL_ACCOUNTS_KEY)).toBeUndefined();
    expect(resolveScopedAccountId(accounts, "hdfc-1")).toBe("hdfc bank|1111");
    expect(resolveScopedAccountId(accounts, "missing")).toBeUndefined();
  });
});
