import type { HomeAccount } from "./types";
import { fallbackVisualStyle } from "./visual";

export function emptyAccountPreview(currency: string): HomeAccount {
  return {
    id: "account:empty",
    key: "account:empty",
    bankName: "No account connected",
    bankColor: fallbackVisualStyle.ink,
    status: "—",
    balance: "—",
    balanceMinorUnits: null,
    last4: "—",
    currency,
    netAcross: "—",
    balanceMeta: null,
    reportedBalance: null,
    reportedMeta: null,
    capturedIncome: null,
    capturedExpense: null,
    capturedChange: null,
    capturedTransactionCount: 0,
    reconciliation: null,
    unassignedNote: null,
  };
}

