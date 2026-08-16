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

// "likely": 3+ distinct-day occurrences with 2+ consecutive gaps that all
// look like a real monthly cycle. "possible": only 1 qualifying gap (2
// occurrences) — real, but two observations isn't enough to be confident;
// callers should keep these out of any combined "/month" total.
export type SubscriptionConfidence = "likely" | "possible";

export interface Subscription {
  merchant: string;
  amount: number;
  currency: string;
  count: number;
  lastDate: number;
  confidence: SubscriptionConfidence;
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
// A subscription that hasn't renewed in two billing cycles is either
// cancelled or was never real — without this, a January 2023 pair of
// charges would still be called a "subscription" in 2026.
const RECENCY_WINDOW_DAYS = 60;
// Allows a price change, tax adjustment, or currency-rounding difference
// between charges without accepting two amounts that are just unrelated.
const AMOUNT_TOLERANCE_RATIO = 0.1;
// Only these trxTypeRich values are eligible to be grouped as a candidate
// recurring payment. ATM_WITHDRAWAL and TRANSFER are one-off cash movements
// that happen to repeat, not a billed service; INVESTMENT is money going
// into a SIP/MF, not a subscription; RECHARGE is its own recurring-plan
// concept, not a merchant subscription, and isn't tracked as one here.
const SUBSCRIPTION_DIRECTION_TYPES = new Set<TrxTypeRich>([
  "EXPENSE",
  "AUTO_DEBIT",
  "WALLET_DEBIT",
]);

interface SubscriptionOccurrence {
  date: number;
  amount: number;
  merchant: string;
}

// Case, whitespace, and a trailing ".com"/".in"/".co" shouldn't split one
// real merchant into "NETFLIX", "Netflix.com", and "Netflix" as three
// unrelated candidates.
function normalizeMerchant(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\.(com|in|co)$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Collapses same-day repeats to one occurrence (keeping the latest). Two SMS
// confirming the same real-world charge sometimes land on the same calendar
// day (a bank's own duplicate notification, or a "processing" + "completed"
// pair for one purchase) — without this, that pair alone would look like
// two occurrences of a "subscription" that never actually recurred.
function distinctDaysSorted(occurrences: SubscriptionOccurrence[]): SubscriptionOccurrence[] {
  const latestPerDay = new Map<string, SubscriptionOccurrence>();
  for (const occ of occurrences) {
    const d = new Date(occ.date);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const current = latestPerDay.get(key);
    if (!current || occ.date > current.date) latestPerDay.set(key, occ);
  }
  return [...latestPerDay.values()].sort((a, b) => a.date - b.date);
}

// Walks backward from the most recent distinct-day occurrence, keeping only
// the unbroken run where every consecutive gap looks like a real monthly
// billing cycle. An older, unrelated repeat from before the pattern
// established itself (or from after a long gap where it lapsed) doesn't get
// to vouch for the current run — this checks every gap in the run, not just
// the latest one.
function trailingRecurringRun(daysSorted: SubscriptionOccurrence[]): SubscriptionOccurrence[] {
  if (daysSorted.length === 0) return [];
  const run = [daysSorted[daysSorted.length - 1]!];
  for (let i = daysSorted.length - 2; i >= 0; i--) {
    const gapDays = (run[0]!.date - daysSorted[i]!.date) / ONE_DAY_MS;
    if (gapDays < MIN_RECURRING_GAP_DAYS || gapDays > MAX_RECURRING_GAP_DAYS) break;
    run.unshift(daysSorted[i]!);
  }
  return run;
}

function amountsWithinTolerance(occurrences: SubscriptionOccurrence[]): boolean {
  const amounts = occurrences.map((o) => o.amount);
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  if (min <= 0) return max === min;
  return (max - min) / min <= AMOUNT_TOLERANCE_RATIO;
}

// Latest known balance per bank account, currency-separated income/expense
// totals for the current month, a cadence-aware recurring-charge heuristic,
// and the most recent recognized transactions — all derived client-side
// from what Malana already extracted. No message is ever excluded from this
// derivation; unrecognized ones just don't contribute to any bucket.
//
// `now` is injectable (defaults to the real clock) so tests can assert an
// exact-day boundary (e.g. "included at exactly 60 days old") without
// racing the small drift between when a test captures its own reference
// time and when this function calls `new Date()` internally.
export function deriveDashboard(messages: ParsedSms[], now: Date = new Date()): Dashboard {
  const accountsByKey = new Map<string, AccountBalance>();
  const monthIncomeByCurrency: Record<string, number> = {};
  const monthExpenseByCurrency: Record<string, number> = {};
  const subscriptionCandidates = new Map<
    string,
    { currency: string; occurrences: SubscriptionOccurrence[] }
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
    if (
      result.trxTypeRich &&
      SUBSCRIPTION_DIRECTION_TYPES.has(result.trxTypeRich) &&
      !result.mandateId
    ) {
      const rawMerchant = result.brandName ?? result.vendor;
      const amount = parseAmount(result.trx);
      const currency = result.currency ?? "INR";
      if (rawMerchant && amount !== null) {
        const normalized = normalizeMerchant(rawMerchant);
        if (normalized) {
          const key = `${normalized}|${currency}`;
          const occurrence: SubscriptionOccurrence = {
            date: m.date,
            amount,
            merchant: rawMerchant,
          };
          const existing = subscriptionCandidates.get(key);
          if (existing) existing.occurrences.push(occurrence);
          else subscriptionCandidates.set(key, { currency, occurrences: [occurrence] });
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
  for (const v of subscriptionCandidates.values()) {
    const run = trailingRecurringRun(distinctDaysSorted(v.occurrences));
    // Fewer than 2 occurrences in the qualifying run means zero or one
    // gap looked like a billing cycle — not enough to call it recurring.
    if (run.length < 2) continue;
    const last = run[run.length - 1]!;
    // A subscription that hasn't renewed recently is either cancelled or
    // was never real — an old pair of charges shouldn't count forever.
    if ((now.getTime() - last.date) / ONE_DAY_MS > RECENCY_WINDOW_DAYS) continue;
    // A price change is plausible; a wildly different amount means these
    // aren't really the same recurring charge.
    if (!amountsWithinTolerance(run)) continue;
    subscriptions.push({
      merchant: last.merchant,
      amount: last.amount,
      currency: v.currency,
      count: run.length,
      lastDate: last.date,
      // 3+ occurrences means 2+ consecutive gaps confirmed the cadence;
      // exactly 2 occurrences is a single gap — real, but not enough
      // evidence to be confident yet.
      confidence: run.length >= 3 ? "likely" : "possible",
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

// Only "likely" subscriptions ever count toward a combined monthly total —
// a "possible" entry (a single confirmed gap) is real evidence but not
// confident enough to be presented as money that will definitely recur.
// Exported as the one place this filter is applied, so a UI summing
// subscriptions can't accidentally include "possible" ones by re-deriving
// the sum itself.
export function subscriptionMonthlyTotals(subscriptions: Subscription[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const s of subscriptions) {
    if (s.confidence !== "likely") continue;
    totals[s.currency] = (totals[s.currency] ?? 0) + s.amount;
  }
  return totals;
}

// A transaction is recurring if it's tied to a tracked UPI mandate, or its
// normalized merchant+currency matches a guessed-from-repeats Subscription
// within the same amount tolerance deriveDashboard used to group it. Kept as
// a lookup against the already-derived Dashboard rather than a per-message
// parser field — "is this part of a recurring series" is a cross-message
// dashboard-level fact, not something a single SMS can know about itself.
export function isRecurringTransaction(item: ParsedSms, dashboard: Dashboard): boolean {
  const { result } = item;
  if (result.mandateId && dashboard.mandates.some((m) => m.mandateId === result.mandateId)) {
    return true;
  }
  const merchant = result.brandName ?? result.vendor;
  const amount = parseAmount(result.trx);
  const currency = result.currency ?? "INR";
  if (merchant && amount !== null) {
    const normalized = normalizeMerchant(merchant);
    return dashboard.subscriptions.some(
      (s) =>
        normalizeMerchant(s.merchant) === normalized &&
        s.currency === currency &&
        Math.abs(s.amount - amount) / Math.max(s.amount, amount, 1) <= AMOUNT_TOLERANCE_RATIO,
    );
  }
  return false;
}
