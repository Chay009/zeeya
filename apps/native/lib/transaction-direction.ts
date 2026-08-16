import type { TrxTypeRich } from "@zeeya/parser/malana";

export type TrxDirection = "expense" | "income" | "neutral";

// Single source of truth for which trxTypeRich values represent money
// leaving the account, entering it, or neither. Dashboard totals and the
// Recent list's sign must never classify a type differently from each
// other — this used to be two independently hardcoded lists that had
// already drifted apart.
//
// TRANSFER: malana.ts's deriveRichType only ever assigns this when money
// left the account (NEFT/IMPS/RTGS/AEPS debit) — never for an incoming
// transfer, so it belongs with the other outflows.
// RECHARGE / INVESTMENT: both require a real debit-shaped trx tag to fire —
// paying for a recharge or buying into a SIP/MF is money leaving the account.
const EXPENSE_DIRECTION_TYPES = new Set<TrxTypeRich>([
  "EXPENSE",
  "AUTO_DEBIT",
  "WALLET_DEBIT",
  "ATM_WITHDRAWAL",
  "TRANSFER",
  "RECHARGE",
  "INVESTMENT",
]);
const INCOME_DIRECTION_TYPES = new Set<TrxTypeRich>(["INCOME", "SALARY"]);
// WALLET_CREDIT (money moving into a wallet) and BALANCE_UPDATE (no
// transaction at all) are deliberately neither — a wallet top-up is an
// internal transfer, not new income, and forcing it into either bucket
// would misrepresent it.

export function trxDirection(trxTypeRich: TrxTypeRich | null): TrxDirection {
  if (trxTypeRich && EXPENSE_DIRECTION_TYPES.has(trxTypeRich)) return "expense";
  if (trxTypeRich && INCOME_DIRECTION_TYPES.has(trxTypeRich)) return "income";
  return "neutral";
}
