import { addCalendarMonths } from "./calendar";
import type { SubscriptionSummary, UpcomingPayment } from "./dashboard-data";

// Same band as lib/subscriptions.ts's MIN/MAX_RECURRING_GAP_DAYS.
const MIN_SUBSCRIPTION_CADENCE_DAYS = 20;
const MAX_SUBSCRIPTION_CADENCE_DAYS = 45;

/**
 * Returns the median observed interval for one normalized subscription.
 * The input may be newest-first (as the bounded SQL evidence query is), so
 * this helper owns the ordering and interval rules shared by Home and detail.
 */
export function medianSubscriptionCadenceDays(dates: readonly number[]): number | null {
  const chronological = [...dates].sort((left, right) => left - right);
  const intervals = chronological
    .slice(1)
    .map((date, index) => Math.round((date - chronological[index]!) / (24 * 60 * 60 * 1000)))
    .filter((days) => days > 0);
  if (intervals.length === 0) return null;
  intervals.sort((left, right) => left - right);
  return intervals[Math.floor(intervals.length / 2)] ?? null;
}

/**
 * Projects the next payment from the latest observed payment. A measured
 * 20–45-day cadence is kept as observed; the 25–35-day band uses calendar
 * month clamping so Jan-31 subscriptions do not drift after short months.
 * With no measured cadence, the legacy monthly projection remains the honest
 * fallback for a persisted summary that does not carry its evidence rows.
 */
export function nextSubscriptionExpectedAt(
  lastDate: number,
  at: number,
  cadenceDays: number | null | undefined = null,
): number {
  if (lastDate > at) return lastDate;

  const measuredCadence =
    cadenceDays !== null && cadenceDays !== undefined && Number.isFinite(cadenceDays)
      ? Math.round(cadenceDays)
      : null;
  // A measured cadence is trusted only inside the 20–45-day band that
  // defines a subscription at all (lib/subscriptions.ts's recurring run).
  // The cadence evidence is every recent expense at that merchant, not just
  // the qualifying run — one-off purchases or an older weekly habit could
  // otherwise yield e.g. "3 days" and predict a monthly subscription as due
  // every few days. Anything outside the band falls back to monthly.
  if (
    measuredCadence !== null &&
    measuredCadence >= MIN_SUBSCRIPTION_CADENCE_DAYS &&
    measuredCadence <= MAX_SUBSCRIPTION_CADENCE_DAYS &&
    (measuredCadence < 25 || measuredCadence > 35)
  ) {
    let candidate = lastDate;
    for (let offset = 0; offset < 120; offset++) {
      candidate += measuredCadence * 24 * 60 * 60 * 1000;
      if (candidate > at) return candidate;
    }
  } else {
    const origin = new Date(lastDate);
    for (let offset = 1; offset <= 120; offset++) {
      const candidate = addCalendarMonths(origin, offset);
      if (candidate > at) return candidate;
    }
  }
  throw new Error("Could not project the next subscription occurrence.");
}

export function inferUpcomingSubscriptionPayments(
  subscriptions: readonly SubscriptionSummary[],
  at: number,
  limit: number,
  cadenceBySubscriptionId?: ReadonlyMap<string, number | null>,
): UpcomingPayment[] {
  if (!Number.isFinite(new Date(at).getTime())) throw new Error(`at must be valid, got ${at}`);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error(`limit must be an integer between 1 and 100, got ${limit}`);
  }
  return subscriptions
    .map((subscription) => ({
      id: subscription.id,
      source: "subscription" as const,
      merchant: subscription.merchant,
      amountMinorUnits: subscription.amountMinorUnits,
      currency: subscription.currency,
      expectedAt: nextSubscriptionExpectedAt(
        subscription.lastDate,
        at,
        cadenceBySubscriptionId?.get(subscription.id),
      ),
      confidence: subscription.confidence,
      estimated: true as const,
    }))
    .sort((left, right) => left.expectedAt - right.expectedAt || left.id.localeCompare(right.id))
    .slice(0, limit);
}
