import type { ParsedSms } from "@/lib/sms";

export interface BalanceReading {
  balance: number;
  asOf: number;
  // The raw SMS sender ID this reading came from (e.g. "VM-SBIINB") — lets
  // a reading be traced back to the actual message that produced it.
  sender: string;
}

export interface AccountBalance {
  bankName: string;
  last4: string | null;
  balance: number;
  currency: string;
  asOf: number;
  sender: string;
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

export interface MandateEvent {
  status: "active" | "cancelled";
  date: number;
  sender: string;
}

export interface Mandate {
  mandateId: string;
  merchant: string;
  amount: number | null;
  currency: string;
  // Status as of the latest message referencing this mandateId — a mandate
  // stays "active" until a message with the real RESCHE-derived cancellation
  // signal (see enrichment.ts's isMandateCancelled) is seen for the same UMN.
  status: "active" | "cancelled";
  createdAt: number;
  lastUpdated: number;
  sender: string;
  // Every mandate-context message seen for this UMN, newest first — the
  // create/execute/cancel timeline, not just the current status. A message
  // that doesn't flip the status (e.g. an execution) still shows up here.
  history: MandateEvent[];
}

export interface MerchantMandates {
  merchant: string;
  mandates: Mandate[];
}

export interface Dashboard {
  accounts: AccountBalance[];
  monthIncome: number;
  monthExpense: number;
  subscriptions: Subscription[];
  mandates: Mandate[];
  mandatesByMerchant: MerchantMandates[];
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
  const mandatesById = new Map<string, Mandate>();
  const recognized: ParsedSms[] = [];

  for (const m of messages) {
    const { result } = m;
    if (result.category === null) continue;

    if (result.mandateId) {
      const merchant = result.mandateMerchant ?? result.brandName ?? result.bankName ?? m.sender;
      const amount = parseAmount(result.mandateAmount);
      const status = result.mandateEvent ?? "active";
      const event: MandateEvent = { status, date: m.date, sender: m.sender };
      const existing = mandatesById.get(result.mandateId);
      if (!existing) {
        mandatesById.set(result.mandateId, {
          mandateId: result.mandateId,
          merchant,
          amount,
          currency: result.currency ?? "INR",
          status,
          createdAt: m.date,
          lastUpdated: m.date,
          sender: m.sender,
          history: [event],
        });
      } else {
        existing.history.push(event);
        if (amount !== null && existing.amount === null) existing.amount = amount;
        if (m.date < existing.createdAt) existing.createdAt = m.date;
        if (m.date > existing.lastUpdated) {
          existing.lastUpdated = m.date;
          existing.status = status;
          existing.sender = m.sender;
        }
      }
    }

    if (result.bal && result.bankName) {
      const key = `${result.bankName}|${normalizeAcc(result.acc)}`;
      const balance = parseAmount(result.bal);
      if (balance !== null) {
        const reading: BalanceReading = { balance, asOf: m.date, sender: m.sender };
        const existing = accountsByKey.get(key);
        if (!existing) {
          accountsByKey.set(key, {
            bankName: result.bankName,
            last4: normalizeAcc(result.acc) || result.acc,
            balance,
            currency: result.currency ?? "INR",
            asOf: m.date,
            sender: m.sender,
            history: [reading],
          });
        } else {
          existing.history.push(reading);
          if (m.date > existing.asOf) {
            existing.balance = balance;
            existing.asOf = m.date;
            existing.sender = m.sender;
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

  const mandates = [...mandatesById.values()].sort((a, b) => b.lastUpdated - a.lastUpdated);
  for (const man of mandates) man.history.sort((a, b) => b.date - a.date);

  const mandatesByMerchantMap = new Map<string, Mandate[]>();
  for (const man of mandates) {
    const group = mandatesByMerchantMap.get(man.merchant);
    if (group) group.push(man);
    else mandatesByMerchantMap.set(man.merchant, [man]);
  }
  const mandatesByMerchant: MerchantMandates[] = [...mandatesByMerchantMap.entries()]
    .map(([merchant, ms]) => ({ merchant, mandates: ms }))
    .sort((a, b) => b.mandates[0]!.lastUpdated - a.mandates[0]!.lastUpdated);

  return {
    accounts,
    monthIncome,
    monthExpense,
    subscriptions,
    mandates,
    mandatesByMerchant,
    recent: recognized,
  };
}

// A transaction is recurring if it's tied to a tracked UPI mandate, or its
// merchant+amount matches the guessed-from-repeats Subscriptions list. Kept
// as a lookup against the already-derived Dashboard rather than a per-message
// parser field — "is this part of a recurring series" is a cross-message
// dashboard-level fact, not something a single SMS can know about itself.
export function isRecurringTransaction(item: ParsedSms, dashboard: Dashboard): boolean {
  const { result } = item;
  if (result.mandateId && dashboard.mandates.some((m) => m.mandateId === result.mandateId)) {
    return true;
  }
  const merchant = result.brandName ?? result.vendor;
  const amount = parseAmount(result.trx);
  if (merchant && amount !== null) {
    return dashboard.subscriptions.some((s) => s.merchant === merchant && s.amount === amount);
  }
  return false;
}
