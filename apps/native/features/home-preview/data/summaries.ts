import { fromMinorUnits } from "../../../lib/currency";
import type { TransactionSummary } from "../../../lib/dashboard-data";
import type { ParsedSms } from "../../../lib/sms";
import { trxDirection } from "../../../lib/transaction-direction";
import { formatSignedAmount } from "./format-helpers";
import type { NewTransactionSummary } from "./types";
import { merchantName, parseAmount } from "./visual";

// Turns the raw ParsedSms[] the "what's new since you last looked" dialog
// receives (see useDashboardSync's newSinceLastView) into the same
// name/amount/direction shape ActivityItem already presents elsewhere —
// one formatting definition for "how a transaction is summarized," not a
// second one invented for this dialog.
export function summarizeNewTransactions(messages: ParsedSms[]): NewTransactionSummary[] {
  return messages.map((message) => {
    const amount = parseAmount(message.result.trx);
    const direction = trxDirection(message.result.trxTypeRich);
    return {
      key: message.id,
      name: merchantName(message),
      amount:
        amount === null
          ? null
          : formatSignedAmount(
              direction === "income" ? amount : -amount,
              message.result.currency ?? "INR",
            ),
      direction,
    };
  });
}

// Startup/background catch-up comes from the bounded normalized transaction
// query, not ParsedSms. Keep the dialog's presentation identical without
// pulling raw bodies or parser results back into Home.
export function summarizeCaughtUpTransactions(
  transactions: readonly TransactionSummary[],
): NewTransactionSummary[] {
  return transactions.map((transaction) => ({
    key: transaction.id,
    name: transaction.brandName ?? transaction.vendor ?? transaction.bankName ?? "Transaction",
    amount:
      transaction.direction === "neutral"
        ? null
        : formatSignedAmount(
            transaction.direction === "income"
              ? fromMinorUnits(transaction.amountMinorUnits, transaction.currency)
              : -fromMinorUnits(transaction.amountMinorUnits, transaction.currency),
            transaction.currency,
          ),
    direction: transaction.direction,
  }));
}

