import type { ParsedSms } from "@/lib/sms";

export interface AccountBalance {
  bankName: string;
  last4: string | null;
  balance: number;
  currency: string;
  asOf: number;
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
      const key = `${result.bankName}|${result.acc ?? ""}`;
      const balance = parseAmount(result.bal);
      const existing = accountsByKey.get(key);
      if (balance !== null && (!existing || m.date > existing.asOf)) {
        accountsByKey.set(key, {
          bankName: result.bankName,
          last4: result.acc,
          balance,
          currency: result.currency ?? "INR",
          asOf: m.date,
        });
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

    if (result.trxTypeRich) recognized.push(m);
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

  return {
    accounts: [...accountsByKey.values()],
    monthIncome,
    monthExpense,
    subscriptions,
    recent: recognized,
  };
}
