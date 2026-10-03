import { computeBudgetPerformance, type MonthlyDailySpend } from "../lib/budget-analytics";
import type {
  FinancialPeriodSummary,
  InsightsOverview,
  InsightsOverviewQuery,
  RankedSpendingComparison,
  SubscriptionSummary,
  VendorSpendingComparison,
  IncomeSourceComparison,
  LargestCredit,
} from "../lib/dashboard-data";
import { isCommittedSubscription, RECENCY_WINDOW_DAYS } from "../lib/subscriptions";
import { sqlite } from "./client";
import { readConsistentSnapshot } from "./projection-snapshot";
import type { AsyncQueryClient } from "./queries";

type Period = "current" | "previous";

interface PeriodRow {
  period: Period;
  incomeMinorUnits: number;
  spendingMinorUnits: number;
  transactionCount: number;
}

interface ComparisonRow {
  label: string;
  identityKey?: string;
  currentMinorUnits: number;
  previousMinorUnits: number;
  transactionCount: number;
}

interface DaySpendRow {
  dayKey: string;
  spentMinorUnits: number;
}

function defaultClient(): AsyncQueryClient {
  if (!sqlite) throw new Error("Insights overview is unavailable on this platform.");
  return sqlite;
}

function positiveInteger(value: number | undefined, fallback: number, name: string, max: number) {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > max) {
    throw new Error(`${name} must be an integer between 1 and ${max}, got ${resolved}`);
  }
  return resolved;
}

function percentChange(current: number, previous: number): number | null {
  return previous === 0 ? null : Math.round(((current - previous) / previous) * 100);
}

function periodSummary(row?: PeriodRow): FinancialPeriodSummary {
  const incomeMinorUnits = row?.incomeMinorUnits ?? 0;
  const spendingMinorUnits = row?.spendingMinorUnits ?? 0;
  return {
    incomeMinorUnits,
    spendingMinorUnits,
    netMinorUnits: incomeMinorUnits - spendingMinorUnits,
    transactionCount: row?.transactionCount ?? 0,
  };
}

function localDayStart(dayKey: string): number {
  const [year, month, day] = dayKey.split("-").map(Number);
  if (!year || !month || !day) throw new Error(`SQLite returned an invalid local day: ${dayKey}`);
  return new Date(year, month - 1, day).getTime();
}

// The same day-of-month and time last month, clamped to that month's length
// (31 March → 28/29 February) and kept strictly before this month begins.
function samePointLastMonth(at: Date, currentStart: number): number {
  const lastDay = new Date(at.getFullYear(), at.getMonth(), 0).getDate();
  const point = new Date(
    at.getFullYear(),
    at.getMonth() - 1,
    Math.min(at.getDate(), lastDay),
    at.getHours(),
    at.getMinutes(),
    at.getSeconds(),
    at.getMilliseconds(),
  ).getTime();
  return Math.min(point, currentStart - 1);
}

function monthlyDailySpend(rows: DaySpendRow[], at: Date, months: number): MonthlyDailySpend[] {
  const byMonth = new Map<number, MonthlyDailySpend>();
  for (let offset = months - 1; offset >= 0; offset--) {
    const monthStart = new Date(at.getFullYear(), at.getMonth() - offset, 1).getTime();
    byMonth.set(monthStart, { monthStart, dailySpend: [] });
  }
  for (const row of rows) {
    const dayStart = localDayStart(row.dayKey);
    const day = new Date(dayStart);
    const monthStart = new Date(day.getFullYear(), day.getMonth(), 1).getTime();
    byMonth.get(monthStart)?.dailySpend.push({ dayStart, spentMinorUnits: row.spentMinorUnits });
  }
  return [...byMonth.values()];
}

export async function queryInsightsOverviewUnsafe(
  query: InsightsOverviewQuery,
  client: AsyncQueryClient = defaultClient(),
): Promise<InsightsOverview> {
  const at = new Date(query.at);
  if (!Number.isFinite(at.getTime()))
    throw new Error(`at must be a valid timestamp, got ${query.at}`);
  const limit = positiveInteger(query.limit, 5, "limit", 20);
  const historyMonths = positiveInteger(query.historyMonths, 6, "historyMonths", 24);
  const currentStart =
    query.period?.currentFrom ?? new Date(at.getFullYear(), at.getMonth(), 1).getTime();
  const currentEnd = query.period?.currentTo ?? query.at;
  const previousStart =
    query.period?.previousFrom ?? new Date(at.getFullYear(), at.getMonth() - 1, 1).getTime();
  // Like for like: this month so far against last month up to the same
  // point, not the whole of last month — on the 5th, a full-month baseline
  // reads as "−85% vs last month" and trips the material-change notice.
  const previousEnd = query.period?.previousTo ?? samePointLastMonth(at, currentStart);
  const historyStart = new Date(at.getFullYear(), at.getMonth() - historyMonths + 1, 1).getTime();
  const recencyThreshold = query.at - RECENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const periodsPromise = client.getAllAsync<PeriodRow>(
    // The two windows needn't touch (last month stops at the same point), so
    // each row is bucketed by both bounds and anything between them dropped.
    `SELECT period,
            SUM(CASE WHEN direction = 'income' THEN amount_minor_units ELSE 0 END) AS incomeMinorUnits,
            SUM(CASE WHEN direction = 'expense' THEN amount_minor_units ELSE 0 END) AS spendingMinorUnits,
            COUNT(*) AS transactionCount
     FROM (
       SELECT direction, amount_minor_units,
              CASE WHEN date >= ? AND date <= ? THEN 'current'
                   WHEN date >= ? AND date <= ? THEN 'previous' END AS period
       FROM transactions
       WHERE currency = ? AND date >= ? AND date <= ? AND direction IN ('income', 'expense')
     )
     WHERE period IS NOT NULL
     GROUP BY period`,
    [
      currentStart,
      currentEnd,
      previousStart,
      previousEnd,
      query.currency,
      previousStart,
      currentEnd,
    ],
  );
  const categoriesPromise = client.getAllAsync<ComparisonRow>(
    `SELECT category AS label,
            SUM(CASE WHEN date >= ? AND date <= ? THEN amount_minor_units ELSE 0 END) AS currentMinorUnits,
            SUM(CASE WHEN date >= ? AND date <= ? THEN amount_minor_units ELSE 0 END) AS previousMinorUnits,
            SUM(CASE WHEN date >= ? AND date <= ? THEN 1 ELSE 0 END) AS transactionCount
     FROM transactions
     WHERE currency = ? AND direction = 'expense' AND date >= ? AND date <= ?
     GROUP BY category
     HAVING SUM(CASE WHEN date >= ? AND date <= ? THEN amount_minor_units ELSE 0 END) > 0
     ORDER BY currentMinorUnits DESC, category ASC
     LIMIT ?`,
    [
      currentStart,
      currentEnd,
      previousStart,
      previousEnd,
      currentStart,
      currentEnd,
      query.currency,
      previousStart,
      currentEnd,
      currentStart,
      currentEnd,
      limit,
    ],
  );
  const vendorsPromise = client.getAllAsync<ComparisonRow>(
    `SELECT MAX(COALESCE(NULLIF(TRIM(brand_name), ''), NULLIF(TRIM(vendor), ''))) AS label,
            subscription_identity_key AS identityKey,
            SUM(CASE WHEN date >= ? AND date <= ? THEN amount_minor_units ELSE 0 END) AS currentMinorUnits,
            SUM(CASE WHEN date >= ? AND date <= ? THEN amount_minor_units ELSE 0 END) AS previousMinorUnits,
            SUM(CASE WHEN date >= ? AND date <= ? THEN 1 ELSE 0 END) AS transactionCount
     FROM transactions
     WHERE currency = ? AND direction = 'expense' AND date >= ? AND date <= ?
       AND subscription_identity_key IS NOT NULL
     GROUP BY subscription_identity_key
     HAVING SUM(CASE WHEN date >= ? AND date <= ? THEN amount_minor_units ELSE 0 END) > 0
     ORDER BY currentMinorUnits DESC, subscription_identity_key ASC
     LIMIT ?`,
    [
      currentStart,
      currentEnd,
      previousStart,
      previousEnd,
      currentStart,
      currentEnd,
      query.currency,
      previousStart,
      currentEnd,
      currentStart,
      currentEnd,
      limit,
    ],
  );
  // Income by where it came from: the payer's brand or name, else the income
  // category ("Salary", "Interest"), so a credit with no named payer still
  // lands in a meaningful source.
  const incomeSourceLabel = `COALESCE(NULLIF(TRIM(brand_name), ''), NULLIF(TRIM(vendor), ''),
                                      NULLIF(TRIM(category), ''), 'Other income')`;
  const incomeSourcesPromise = client.getAllAsync<ComparisonRow>(
    `SELECT ${incomeSourceLabel} AS label,
            SUM(CASE WHEN date >= ? AND date <= ? THEN amount_minor_units ELSE 0 END) AS currentMinorUnits,
            SUM(CASE WHEN date >= ? AND date <= ? THEN amount_minor_units ELSE 0 END) AS previousMinorUnits,
            SUM(CASE WHEN date >= ? AND date <= ? THEN 1 ELSE 0 END) AS transactionCount
     FROM transactions
     WHERE currency = ? AND direction = 'income' AND date >= ? AND date <= ?
     GROUP BY label
     HAVING SUM(CASE WHEN date >= ? AND date <= ? THEN amount_minor_units ELSE 0 END) > 0
     ORDER BY currentMinorUnits DESC, label ASC
     LIMIT ?`,
    [
      currentStart,
      currentEnd,
      previousStart,
      previousEnd,
      currentStart,
      currentEnd,
      query.currency,
      previousStart,
      currentEnd,
      currentStart,
      currentEnd,
      limit,
    ],
  );
  const largestCreditPromise = client.getAllAsync<{
    label: string;
    amountMinorUnits: number;
    date: number;
  }>(
    `SELECT ${incomeSourceLabel} AS label, amount_minor_units AS amountMinorUnits, date
     FROM transactions
     WHERE currency = ? AND direction = 'income' AND date >= ? AND date <= ?
     ORDER BY amount_minor_units DESC, date DESC
     LIMIT 1`,
    [query.currency, currentStart, currentEnd],
  );
  const subscriptionsPromise = client.getAllAsync<SubscriptionSummary>(
    `SELECT id, merchant, amount_minor_units AS amountMinorUnits, currency, count,
            last_date AS lastDate, confidence
     FROM subscriptions
     WHERE currency = ? AND last_date >= ?
     ORDER BY amount_minor_units DESC, id ASC`,
    [query.currency, recencyThreshold],
  );
  const daysPromise =
    query.dailyBudgetMinorUnits === undefined
      ? Promise.resolve([] as DaySpendRow[])
      : client.getAllAsync<DaySpendRow>(
          `SELECT strftime('%Y-%m-%d', date / 1000, 'unixepoch', 'localtime') AS dayKey,
                  SUM(amount_minor_units) AS spentMinorUnits
           FROM transactions
           WHERE currency = ? AND direction = 'expense' AND date >= ? AND date <= ?
           GROUP BY dayKey
           ORDER BY dayKey ASC`,
          [query.currency, historyStart, query.at],
        );

  const [periodRows, categoryRows, vendorRows, subscriptions, dayRows, incomeRows, creditRows] =
    await Promise.all([
      periodsPromise,
      categoriesPromise,
      vendorsPromise,
      subscriptionsPromise,
      daysPromise,
      incomeSourcesPromise,
      largestCreditPromise,
    ]);
  const topIncomeSources: IncomeSourceComparison[] = incomeRows.map((row) => ({
    source: row.label,
    currentMinorUnits: row.currentMinorUnits,
    previousMinorUnits: row.previousMinorUnits,
    deltaMinorUnits: row.currentMinorUnits - row.previousMinorUnits,
    changePercent: percentChange(row.currentMinorUnits, row.previousMinorUnits),
    transactionCount: row.transactionCount,
  }));
  const largestCredit: LargestCredit | null = creditRows[0]
    ? {
        source: creditRows[0].label,
        amountMinorUnits: creditRows[0].amountMinorUnits,
        date: creditRows[0].date,
      }
    : null;
  const currentMonth = periodSummary(periodRows.find((row) => row.period === "current"));
  const previousMonth = periodSummary(periodRows.find((row) => row.period === "previous"));
  const topCategories: RankedSpendingComparison[] = categoryRows.map((row) => ({
    category: row.label,
    currentMinorUnits: row.currentMinorUnits,
    previousMinorUnits: row.previousMinorUnits,
    deltaMinorUnits: row.currentMinorUnits - row.previousMinorUnits,
    changePercent: percentChange(row.currentMinorUnits, row.previousMinorUnits),
  }));
  const topVendors: VendorSpendingComparison[] = vendorRows.map((row) => ({
    vendor: row.label,
    ...(row.identityKey ? { identityKey: row.identityKey } : {}),
    currentMinorUnits: row.currentMinorUnits,
    previousMinorUnits: row.previousMinorUnits,
    deltaMinorUnits: row.currentMinorUnits - row.previousMinorUnits,
    changePercent: percentChange(row.currentMinorUnits, row.previousMinorUnits),
    transactionCount: row.transactionCount,
  }));
  const likelySubscriptions = subscriptions.filter(isCommittedSubscription);

  return {
    currency: query.currency,
    currentMonth,
    previousMonth,
    spendingChangePercent: percentChange(
      currentMonth.spendingMinorUnits,
      previousMonth.spendingMinorUnits,
    ),
    topCategories,
    topVendors,
    topIncomeSources,
    largestCredit,
    subscriptions: {
      activeCount: subscriptions.length,
      likelyCount: likelySubscriptions.length,
      monthlyCommittedMinorUnits: likelySubscriptions.reduce(
        (total, item) => total + item.amountMinorUnits,
        0,
      ),
      top: subscriptions.slice(0, limit),
    },
    budget: computeBudgetPerformance({
      at: query.at,
      dailyBudgetMinorUnits: query.dailyBudgetMinorUnits,
      months: monthlyDailySpend(dayRows, at, historyMonths),
    }),
  };
}

export function queryInsightsOverview(query: InsightsOverviewQuery): Promise<InsightsOverview> {
  return readConsistentSnapshot(() => queryInsightsOverviewUnsafe(query));
}
