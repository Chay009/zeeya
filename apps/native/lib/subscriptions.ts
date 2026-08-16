import type { TrxTypeRich } from "@zeeya/parser/malana";
import type { ParsedSms } from "./sms";

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

// Duplicated from dashboard.ts rather than imported — this module must not
// depend on dashboard.ts (dashboard.ts depends on this one), and a 4-line
// pure parser isn't worth a shared-utility module of its own.
function parseAmount(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number.parseFloat(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
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

// Infers recurring payments from repeated merchant+amount+currency charges —
// this is a heuristic over ordinary transaction messages, not confirmed
// mandate data (see dashboard.ts's mandate aggregation for the confirmed
// tier). `now` is injectable (defaults to the real clock) so tests can
// assert an exact-day boundary without racing the small drift between when
// a test captures its own reference time and when this function calls
// `new Date()` internally.
export function deriveSubscriptions(messages: ParsedSms[], now: Date = new Date()): Subscription[] {
  const candidates = new Map<string, { currency: string; occurrences: SubscriptionOccurrence[] }>();

  for (const m of messages) {
    const { result } = m;
    if (result.category === null) continue;

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
          const existing = candidates.get(key);
          if (existing) existing.occurrences.push(occurrence);
          else candidates.set(key, { currency, occurrences: [occurrence] });
        }
      }
    }
  }

  const subscriptions: Subscription[] = [];
  for (const v of candidates.values()) {
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

  return subscriptions;
}

// Only "likely" subscriptions ever count toward a combined monthly total —
// a "possible" entry (a single confirmed gap) is real evidence but not
// confident enough to be presented as money that will definitely recur.
// Exported as the one place this filter is applied, so a caller summing
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

// True if a message's normalized merchant+currency matches a guessed
// Subscription within the same amount tolerance deriveSubscriptions used to
// group it. Named "inferred" because this is the heuristic half only — the
// mandate-confirmed half lives in dashboard.ts's isRecurringTransaction,
// which combines both at the Dashboard boundary.
export function isInferredRecurringTransaction(
  item: ParsedSms,
  subscriptions: Subscription[],
): boolean {
  const { result } = item;
  const merchant = result.brandName ?? result.vendor;
  const amount = parseAmount(result.trx);
  const currency = result.currency ?? "INR";
  if (merchant && amount !== null) {
    const normalized = normalizeMerchant(merchant);
    return subscriptions.some(
      (s) =>
        normalizeMerchant(s.merchant) === normalized &&
        s.currency === currency &&
        Math.abs(s.amount - amount) / Math.max(s.amount, amount, 1) <= AMOUNT_TOLERANCE_RATIO,
    );
  }
  return false;
}
