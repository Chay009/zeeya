import type { AccountBalance } from "../../../lib/dashboard";
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

export function presentAccount(account: AccountBalance): AccountPresentation {
  const hasReportedBalance = account.anchorStatus === "reported";
  const hasCapturedTransactions = account.capturedTransactionCount > 0;
  const displayedBalance = hasCapturedTransactions ? account.estimatedBalance : account.balance;

  return {
    status: !hasReportedBalance ? "TRACKING" : hasCapturedTransactions ? "CALCULATED" : "REPORTED",
    balance: displayedBalance === null ? "—" : formatMoney(displayedBalance, account.currency),
    asOf: hasCapturedTransactions ? account.estimatedAsOf : account.asOf,
    hasReportedBalance,
    hasCapturedTransactions,
    capturedIncomeLabel: hasReportedBalance ? "Added since then" : "Captured income",
    capturedExpenseLabel: hasReportedBalance ? "Spent since then" : "Captured spending",
  };
}
