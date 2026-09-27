import { fromMinorUnits } from "../../../lib/currency";
import type { TransactionSummary } from "../../../lib/dashboard-data";
import { formatSignedAmount } from "./format-helpers";
import type { NewTransactionSummary } from "./types";

// The "while you were away" dialog's rows, from the bounded normalized
// transaction query (db/caught-up-transactions.ts) — never raw SMS bodies or
// parser results pulled back into Home.
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

