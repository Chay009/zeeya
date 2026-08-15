import type { ParsedSms } from "@/lib/sms";

export interface BalanceReading {
  balance: number;
  asOf: number;
}

export interface AccountBalance {
  bankName: string;
  last4: string | null;
  balance: number;
  currency: string;
  asOf: number;
  // Every balance reading seen for this account, newest first, including
  // ones older than the current `balance` — nothing the parser extracted is
  // dropped, it's just not all shown as the headline figure.
  history: BalanceReading[];
}

export interface Subscription {
  merchant: string;
  amount: number;
  currency: string;
  count: number;
  lastDate: number;
}

export interface Dashboard {
  accounts: AccountBalance[];
  monthIncome: number;
  monthExpense: number;
  subscriptions: Subscription[];
  recent: ParsedSms[];
}

const EXPENSE_TYPES = new Set(["EXPENSE", "AUTO_DEBIT", "WALLET_DEBIT", "ATM_WITHDRAWAL"]);
const INCOME_TYPES = new Set(["INCOME", "SALARY"]);

function parseAmount(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number.parseFloat(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

// Different SMS from the same bank mask the account number differently
// ("1234", "XX1234", "*1234", or missing entirely) — normalize to just the
// trailing digits so the same real account doesn't produce multiple cards.
function normalizeAcc(acc: string | null): string {
  if (!acc) return "";
  const digits = acc.replace(/\D/g, "");
  return digits.slice(-4);
}

// Latest known balance per bank account, income/expense totals for the
// current month, a simple recurring-charge heuristic (same merchant + same
// amount seen 2+ times), and the most recent recognized transactions —
// all derived client-side from what Malana already extracted. No message is
// ever excluded from this derivation; unrecognized ones just don't
// contribute to any bucket.
export function deriveDashboard(messages: ParsedSms[]): Dashboard {
  const now = new Date();
  const accountsByKey = new Map<string, AccountBalance>();
  let monthIncome = 0;
  let monthExpense = 0;
  const subscriptionCandidates = new Map<string, { amount: number; count: number; lastDate: number }>();
  const recognized: ParsedSms[] = [];

  for (const m of messages) {
    const { result } = m;
    if (result.category === null) continue;

    if (result.bal && result.bankName) {
      const key = `${result.bankName}|${normalizeAcc(result.acc)}`;
      const balance = parseAmount(result.bal);
      if (balance !== null) {
        const reading: BalanceReading = { balance, asOf: m.date };
        const existing = accountsByKey.get(key);
        if (!existing) {
          accountsByKey.set(key, {
            bankName: result.bankName,
            last4: normalizeAcc(result.acc) || result.acc,
            balance,
            currency: result.currency ?? "INR",
            asOf: m.date,
            history: [reading],
          });
        } else {
          existing.history.push(reading);
          if (m.date > existing.asOf) {
            existing.balance = balance;
            existing.asOf = m.date;
            existing.currency = result.currency ?? existing.currency;
          }
        }
      }
    }

    if (result.trxTypeRich && isSameMonth(new Date(m.date), now)) {
      const amount = parseAmount(result.trx);
      if (amount !== null) {
        if (EXPENSE_TYPES.has(result.trxTypeRich)) monthExpense += amount;
        else if (INCOME_TYPES.has(result.trxTypeRich)) monthIncome += amount;
      }
    }

    if (result.trxTypeRich && EXPENSE_TYPES.has(result.trxTypeRich)) {
      const merchant = result.brandName ?? result.vendor;
      const amount = parseAmount(result.trx);
      if (merchant && amount !== null) {
        const key = `${merchant}|${amount}`;
        const existing = subscriptionCandidates.get(key);
        if (existing) {
          existing.count += 1;
          if (m.date > existing.lastDate) existing.lastDate = m.date;
        } else {
          subscriptionCandidates.set(key, { amount, count: 1, lastDate: m.date });
        }
      }
    }

    // A trxTypeRich tag alone isn't proof of an actual transaction — e.g. a
    // telecom "your plan is valid till..." notice can trigger the RECHARGE
    // tag without being a real recharge purchase. Require a real parsed
    // amount too, so informational notices don't show up as transactions.
    if (result.trxTypeRich && parseAmount(result.trx) !== null) recognized.push(m);
  }

  const subscriptions: Subscription[] = [];
  for (const [key, v] of subscriptionCandidates) {
    if (v.count < 2) continue;
    const merchant = key.slice(0, key.lastIndexOf("|"));
    subscriptions.push({
      merchant,
      amount: v.amount,
      currency: "INR",
      count: v.count,
      lastDate: v.lastDate,
    });
  }
  subscriptions.sort((a, b) => b.lastDate - a.lastDate);

  recognized.sort((a, b) => b.date - a.date);

  const accounts = [...accountsByKey.values()];
  for (const acc of accounts) acc.history.sort((a, b) => b.asOf - a.asOf);

  return {
    accounts,
    monthIncome,
    monthExpense,
    subscriptions,
    recent: recognized,
  };
}
