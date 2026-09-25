import type {
  FinancialPeriodSummary,
  HomeHighlights,
  HomeHighlightsQuery,
  SubscriptionSummary,
  TransactionSummary,
} from "../lib/dashboard-data";
import { inferUpcomingSubscriptionPayments } from "../lib/upcoming-payments";
import {
  AMOUNT_TOLERANCE_RATIO,
  isCommittedSubscription,
  RECENCY_WINDOW_DAYS,
} from "../lib/subscriptions";
import { medianSubscriptionCadenceDays } from "../lib/upcoming-payments";
import { sqlite } from "./client";
import { readConsistentSnapshot } from "./projection-snapshot";
import type { AsyncQueryClient } from "./queries";

interface PeriodRow {
  incomeMinorUnits: number;
  spendingMinorUnits: number;
  transactionCount: number;
}

interface TotalRow {
  totalMinorUnits: number;
}

interface CountRow {
  count: number;
}

interface SubscriptionCadenceRow {
  subscriptionId: string;
  date: number;
}

const DEFAULT_RECENT_LIMIT = 5;
const DEFAULT_UPCOMING_LIMIT = 5;
const MAX_HIGHLIGHT_LIMIT = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

function defaultClient(): AsyncQueryClient {
  if (!sqlite) throw new Error("Home highlights are unavailable on this platform.");
  return sqlite;
}

function boundedLimit(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > MAX_HIGHLIGHT_LIMIT) {
    throw new Error(
      `${name} must be an integer between 1 and ${MAX_HIGHLIGHT_LIMIT}, got ${resolved}`,
    );
  }
  return resolved;
}

function transactionSelect(): string {
  return `id, date, amount_minor_units AS amountMinorUnits, currency, direction,
          account_id AS accountId, trx_type_rich AS trxTypeRich, vendor,
          brand_name AS brandName, category, ref, bank_name AS bankName,
          mandate_id AS mandateId`;
}

// Home's upcoming list and recurring detail must forecast from the same
// observed cadence. The projection already stores the normalized
// subscription_identity_key on every transaction, so this bounded window can
// collect evidence for all active subscriptions without repeating merchant
// normalization in SQL or scanning the full ledger.
async function querySubscriptionCadences(
  client: AsyncQueryClient,
  subscriptions: readonly SubscriptionSummary[],
  currency: string,
  at: number,
): Promise<ReadonlyMap<string, number | null>> {
  const ids = subscriptions.map((subscription) => subscription.id);
  const result = new Map<string, number | null>();
  if (ids.length === 0) return result;

  const placeholders = ids.map(() => "?").join(", ");
  const rows = await client.getAllAsync<SubscriptionCadenceRow>(
    `SELECT subscriptionId, date
     FROM (
       SELECT subscription_identity_key AS subscriptionId,
              date,
              ROW_NUMBER() OVER (
                PARTITION BY subscription_identity_key
                ORDER BY date DESC, id DESC
              ) AS occurrenceRank
       FROM transactions
       WHERE currency = ?
         AND direction = 'expense'
         AND date <= ?
         AND subscription_identity_key IN (${placeholders})
     )
     WHERE occurrenceRank <= 24
     ORDER BY subscriptionId ASC, date ASC`,
    [currency, at, ...ids],
  );
  const datesBySubscription = new Map<string, number[]>();
  for (const row of rows) {
    const dates = datesBySubscription.get(row.subscriptionId) ?? [];
    dates.push(row.date);
    datesBySubscription.set(row.subscriptionId, dates);
  }
  for (const subscription of subscriptions) {
    result.set(
      subscription.id,
      medianSubscriptionCadenceDays(datesBySubscription.get(subscription.id) ?? []),
    );
  }
  return result;
}

function periodSummary(row: PeriodRow | undefined): FinancialPeriodSummary {
  const incomeMinorUnits = row?.incomeMinorUnits ?? 0;
  const spendingMinorUnits = row?.spendingMinorUnits ?? 0;
  return {
    incomeMinorUnits,
    spendingMinorUnits,
    netMinorUnits: incomeMinorUnits - spendingMinorUnits,
    transactionCount: row?.transactionCount ?? 0,
  };
}

export async function queryHomeHighlightsUnsafe(
  query: HomeHighlightsQuery,
  client: AsyncQueryClient = defaultClient(),
): Promise<HomeHighlights> {
  const at = new Date(query.at);
  if (!Number.isFinite(at.getTime()))
    throw new Error(`at must be a valid timestamp, got ${query.at}`);
  const recentLimit = boundedLimit(query.recentLimit, DEFAULT_RECENT_LIMIT, "recentLimit");
  const upcomingLimit = boundedLimit(query.upcomingLimit, DEFAULT_UPCOMING_LIMIT, "upcomingLimit");
  const dayStart = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
  const dayEnd = new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1).getTime();
  const monthStart = new Date(at.getFullYear(), at.getMonth(), 1).getTime();
  const monthEnd = new Date(at.getFullYear(), at.getMonth() + 1, 1).getTime();
  const recencyThreshold = query.at - RECENCY_WINDOW_DAYS * DAY_MS;
  const transactionColumns = transactionSelect();

  const accountClause = query.accountId ? " AND account_id = ?" : "";
  const accountParams = query.accountId ? [query.accountId] : [];
  const periodPromise = client.getAllAsync<PeriodRow>(
    `SELECT SUM(CASE WHEN direction = 'income' THEN amount_minor_units ELSE 0 END) AS incomeMinorUnits,
            SUM(CASE WHEN direction = 'expense' THEN amount_minor_units ELSE 0 END) AS spendingMinorUnits,
            COUNT(*) AS transactionCount
     FROM transactions
     WHERE currency = ? AND date >= ? AND date < ? AND date <= ?
       AND direction IN ('income', 'expense')${accountClause}`,
    [query.currency, dayStart, dayEnd, query.at, ...accountParams],
  );
  const recentPromise = client.getAllAsync<TransactionSummary>(
    `SELECT ${transactionColumns}
     FROM transactions
     WHERE currency = ? AND date >= ? AND date < ? AND date <= ?
       AND direction IN ('income', 'expense')${accountClause}
     ORDER BY date DESC, id DESC
     LIMIT ?`,
    [query.currency, dayStart, dayEnd, query.at, ...accountParams, recentLimit],
  );
  const largestTransactionPromise = client.getAllAsync<TransactionSummary>(
    `SELECT ${transactionColumns}
     FROM transactions
     WHERE currency = ? AND date >= ? AND date < ? AND date <= ?
       AND direction IN ('income', 'expense')${accountClause}
     ORDER BY amount_minor_units DESC, date DESC, id DESC
     LIMIT 1`,
    [query.currency, dayStart, dayEnd, query.at, ...accountParams],
  );
  const subscriptionsPromise = client.getAllAsync<SubscriptionSummary>(
    `SELECT id, merchant, amount_minor_units AS amountMinorUnits, currency, count,
            last_date AS lastDate, confidence
     FROM subscriptions
     WHERE currency = ? AND last_date >= ?
     ORDER BY last_date DESC, id DESC`,
    [query.currency, recencyThreshold],
  );
  const activeMandateCountPromise = client.getAllAsync<CountRow>(
    `SELECT COUNT(*) AS count
     FROM mandates
     WHERE status = 'active' AND currency = ?`,
    [query.currency],
  );
  const mandateExpectedPromise = client.getAllAsync<TotalRow>(
    `SELECT COALESCE(SUM(amount_minor_units), 0) AS totalMinorUnits
     FROM mandates
     WHERE status = 'active' AND amount_minor_units IS NOT NULL AND currency = ?`,
    [query.currency],
  );
  const subscriptionSpendPromise = client.getAllAsync<TotalRow>(
    `SELECT COALESCE(SUM(t.amount_minor_units), 0) AS totalMinorUnits
     FROM transactions t
     WHERE t.currency = ? AND t.direction = 'expense'
       AND t.date >= ? AND t.date < ? AND t.date <= ?
       AND EXISTS (
         SELECT 1
         FROM subscriptions s
         WHERE s.id = t.subscription_identity_key
           AND s.currency = t.currency
           AND s.last_date >= ?
           AND ABS(s.amount_minor_units - t.amount_minor_units)
             <= ? * MAX(s.amount_minor_units, t.amount_minor_units, 1)
       )`,
    [query.currency, monthStart, monthEnd, query.at, recencyThreshold, AMOUNT_TOLERANCE_RATIO],
  );

  const [
    periodRows,
    recent,
    largestTransactions,
    subscriptions,
    activeMandateCountRows,
    mandateExpectedRows,
    subscriptionSpendRows,
  ] = await Promise.all([
    periodPromise,
    recentPromise,
    largestTransactionPromise,
    subscriptionsPromise,
    activeMandateCountPromise,
    mandateExpectedPromise,
    subscriptionSpendPromise,
  ]);
  const activeMandateCount = activeMandateCountRows[0]?.count ?? 0;
  const mandateExpectedMinorUnits = mandateExpectedRows[0]?.totalMinorUnits ?? 0;
  const likelySubscriptions = subscriptions.filter(isCommittedSubscription);
  const cadenceBySubscriptionId = await querySubscriptionCadences(
    client,
    subscriptions,
    query.currency,
    query.at,
  );
  const upcomingPayments = inferUpcomingSubscriptionPayments(
    subscriptions,
    query.at,
    upcomingLimit,
    cadenceBySubscriptionId,
  );

  return {
    currency: query.currency,
    today: {
      ...periodSummary(periodRows[0]),
      recent,
      largestTransaction: largestTransactions[0] ?? null,
    },
    subscriptions: {
      activeCount: activeMandateCount + subscriptions.length,
      likelyCount: likelySubscriptions.length,
      expectedMonthlyMinorUnits:
        likelySubscriptions.reduce((total, item) => total + item.amountMinorUnits, 0) +
        mandateExpectedMinorUnits,
      spentThisMonthMinorUnits: subscriptionSpendRows[0]?.totalMinorUnits ?? 0,
      nextPayment: upcomingPayments[0] ?? null,
    },
    upcomingPaymentCount: subscriptions.length,
    upcomingPaymentsTotalMinorUnits: subscriptions.reduce(
      (total, item) => total + item.amountMinorUnits,
      0,
    ),
    upcomingPayments,
  };
}

export function queryHomeHighlights(query: HomeHighlightsQuery): Promise<HomeHighlights> {
  return readConsistentSnapshot(() => queryHomeHighlightsUnsafe(query));
}
