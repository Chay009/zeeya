import type { TrxTypeRich } from "@zeeya/parser/malana";
import type { ParsedSms } from "@/lib/sms";

export interface BalanceReading {
  balance: number;
  currency: string;
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
  // Keyed by ISO currency code — summing across currencies as raw numbers
  // would silently mix e.g. INR and USD into one meaningless total.
  monthIncomeByCurrency: Record<string, number>;
  monthExpenseByCurrency: Record<string, number>;
  subscriptions: Subscription[];
  mandates: Mandate[];
  mandatesByMerchant: MerchantMandates[];
  recent: ParsedSms[];
}

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

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
// A monthly billing cycle runs 28-31 days; this band gives early/late
// charges slack without accepting an unrelated same-amount purchase that
// happens to repeat within the same week, or only once a year.
const MIN_RECURRING_GAP_DAYS = 20;
const MAX_RECURRING_GAP_DAYS = 45;

// Collapses same-day repeats to one occurrence. Two SMS confirming the same
// real-world charge sometimes land on the same calendar day (a bank's own
// duplicate notification, or a "processing" + "completed" pair for one
// purchase) — without this, that pair alone would look like two occurrences
// of a "subscription" that never actually recurred.
function distinctDaysSorted(dates: number[]): number[] {
  const latestPerDay = new Map<string, number>();
  for (const ms of dates) {
    const d = new Date(ms);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const current = latestPerDay.get(key);
    if (current === undefined || ms > current) latestPerDay.set(key, ms);
  }
  return [...latestPerDay.values()].sort((a, b) => a - b);
}

// Latest known balance per bank account, currency-separated income/expense
// totals for the current month, a cadence-aware recurring-charge heuristic,
// and the most recent recognized transactions — all derived client-side
// from what Malana already extracted. No message is ever excluded from this
// derivation; unrecognized ones just don't contribute to any bucket.
export function deriveDashboard(messages: ParsedSms[]): Dashboard {
  const now = new Date();
  const accountsByKey = new Map<string, AccountBalance>();
  const monthIncomeByCurrency: Record<string, number> = {};
  const monthExpenseByCurrency: Record<string, number> = {};
  const subscriptionCandidates = new Map<
    string,
    { merchant: string; amount: number; currency: string; dates: number[] }
  >();
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
        const currency = result.currency ?? "INR";
        const reading: BalanceReading = { balance, currency, asOf: m.date, sender: m.sender };
        const existing = accountsByKey.get(key);
        if (!existing) {
          accountsByKey.set(key, {
            bankName: result.bankName,
            last4: normalizeAcc(result.acc) || result.acc,
            balance,
            currency,
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
            existing.currency = currency;
          }
        }
      }
    }

    if (result.trxTypeRich && isSameMonth(new Date(m.date), now)) {
      const amount = parseAmount(result.trx);
      if (amount !== null) {
        const currency = result.currency ?? "INR";
        const direction = trxDirection(result.trxTypeRich);
        if (direction === "expense") {
          monthExpenseByCurrency[currency] = (monthExpenseByCurrency[currency] ?? 0) + amount;
        } else if (direction === "income") {
          monthIncomeByCurrency[currency] = (monthIncomeByCurrency[currency] ?? 0) + amount;
        }
      }
    }

    // Messages already tied to a tracked UPI mandate are excluded here so a
    // real recurring mandate execution can't also get picked up by this
    // merchant+amount-repeat guess — that would show the same recurring
    // charge once under Autopay (grounded in the real UMN) and again under
    // Subscriptions (a heuristic), duplicating its presentation.
    if (result.trxTypeRich && trxDirection(result.trxTypeRich) === "expense" && !result.mandateId) {
      const merchant = result.brandName ?? result.vendor;
      const amount = parseAmount(result.trx);
      const currency = result.currency ?? "INR";
      if (merchant && amount !== null) {
        const key = `${merchant}|${amount}|${currency}`;
        const existing = subscriptionCandidates.get(key);
        if (existing) existing.dates.push(m.date);
        else subscriptionCandidates.set(key, { merchant, amount, currency, dates: [m.date] });
      }
    }

    // A trxTypeRich tag alone isn't proof of an actual transaction — e.g. a
    // telecom "your plan is valid till..." notice can trigger the RECHARGE
    // tag without being a real recharge purchase. Require a real parsed
    // amount too, so informational notices don't show up as transactions.
    if (result.trxTypeRich && parseAmount(result.trx) !== null) recognized.push(m);
  }

  const subscriptions: Subscription[] = [];
  for (const v of subscriptionCandidates.values()) {
    const days = distinctDaysSorted(v.dates);
    if (days.length < 2) continue;
    const last = days[days.length - 1]!;
    const prev = days[days.length - 2]!;
    const gapDays = (last - prev) / ONE_DAY_MS;
    // Two occurrences alone don't prove a monthly cadence — a pair of
    // coincidental same-amount purchases a few days apart, or a one-off
    // repeat a year later, isn't a subscription. Require the most recent
    // gap to actually look like a billing cycle.
    if (gapDays < MIN_RECURRING_GAP_DAYS || gapDays > MAX_RECURRING_GAP_DAYS) continue;
    subscriptions.push({
      merchant: v.merchant,
      amount: v.amount,
      currency: v.currency,
      count: days.length,
      lastDate: last,
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
    monthIncomeByCurrency,
    monthExpenseByCurrency,
    subscriptions,
    mandates,
    mandatesByMerchant,
    recent: recognized,
  };
}

// A transaction is recurring if it's tied to a tracked UPI mandate, or its
// merchant+amount+currency matches the guessed-from-repeats Subscriptions
// list. Kept as a lookup against the already-derived Dashboard rather than a
// per-message parser field — "is this part of a recurring series" is a
// cross-message dashboard-level fact, not something a single SMS can know
// about itself.
export function isRecurringTransaction(item: ParsedSms, dashboard: Dashboard): boolean {
  const { result } = item;
  if (result.mandateId && dashboard.mandates.some((m) => m.mandateId === result.mandateId)) {
    return true;
  }
  const merchant = result.brandName ?? result.vendor;
  const amount = parseAmount(result.trx);
  const currency = result.currency ?? "INR";
  if (merchant && amount !== null) {
    return dashboard.subscriptions.some(
      (s) => s.merchant === merchant && s.amount === amount && s.currency === currency,
    );
  }
  return false;
}
