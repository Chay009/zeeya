import type { AccountBalance } from "../../../lib/dashboard";
import type { AccountSummary } from "../../../lib/dashboard-data";
import { fromMinorUnits } from "../../../lib/currency";
import { formatMoney } from "./format";

export type AccountPresentation = {
  status: "TRACKING" | "CALCULATED" | "REPORTED";
  balance: string;
  asOf: number;
  hasReportedBalance: boolean;
  hasCapturedTransactions: boolean;
  capturedIncomeLabel: "Added since then" | "Captured income";
  capturedExpenseLabel: "Spent since then" | "Captured spending";
};

// Normalized shape both AccountBalance (legacy Dashboard) and AccountSummary
// (SQL-backed) are reduced to before presentAccountFields runs — the two
// source types disagree on field names and units (display number vs. minor
// units), but once reduced to this shape there is exactly one status/
// balance-selection/timestamp/label implementation, not two independently
// maintained copies of the same rules.
type AccountPresentationInput = {
  anchorStatus: "reported" | "unreported";
  capturedTransactionCount: number;
  currency: string;
  // Already display numbers (not minor units) by the time they reach here —
  // each adapter below does its own unit conversion, so this one function
  // never needs to know which source it came from.
  reportedBalance: number | null;
  estimatedBalance: number | null;
  reportedAsOf: number;
  estimatedAsOf: number;
};

function presentAccountFields(account: AccountPresentationInput): AccountPresentation {
  const hasReportedBalance = account.anchorStatus === "reported";
  const hasCapturedTransactions = account.capturedTransactionCount > 0;
  const displayedBalance = hasCapturedTransactions
    ? account.estimatedBalance
    : account.reportedBalance;

  return {
    status: !hasReportedBalance ? "TRACKING" : hasCapturedTransactions ? "CALCULATED" : "REPORTED",
    balance: displayedBalance === null ? "—" : formatMoney(displayedBalance, account.currency),
    asOf: hasCapturedTransactions ? account.estimatedAsOf : account.reportedAsOf,
    hasReportedBalance,
    hasCapturedTransactions,
    capturedIncomeLabel: hasReportedBalance ? "Added since then" : "Captured income",
    capturedExpenseLabel: hasReportedBalance ? "Spent since then" : "Captured spending",
  };
}

export function presentAccount(account: AccountBalance): AccountPresentation {
  return presentAccountFields({
    anchorStatus: account.anchorStatus,
    capturedTransactionCount: account.capturedTransactionCount,
    currency: account.currency,
    reportedBalance: account.balance,
    estimatedBalance: account.estimatedBalance,
    reportedAsOf: account.asOf,
    estimatedAsOf: account.estimatedAsOf,
  });
}

// SQL-backed sibling of presentAccount — converts AccountSummary's own
// minor-unit fields (db-sourced, already computed by projectAccount()) to
// display numbers at this one read boundary, then runs through the exact
// same presentAccountFields every other rule in this file uses, so the two
// source types can never drift into two different status/label/balance
// rules.
export function presentAccountSummary(account: AccountSummary): AccountPresentation {
  return presentAccountFields({
    anchorStatus: account.anchorStatus,
    capturedTransactionCount: account.capturedTransactionCount,
    currency: account.currency,
    reportedBalance:
      account.balanceMinorUnits === null
        ? null
        : fromMinorUnits(account.balanceMinorUnits, account.currency),
    estimatedBalance:
      account.estimatedBalanceMinorUnits === null
        ? null
        : fromMinorUnits(account.estimatedBalanceMinorUnits, account.currency),
    reportedAsOf: account.balanceAsOf,
    estimatedAsOf: account.estimatedAsOf,
  });
}
