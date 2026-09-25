// Async SQL-side aggregate queries against the normalized projection
// tables (db/projections.ts / schema.ts), reading through expo-sqlite's
// own async methods on the already-open, already-keyed connection
// (db/client.native.ts's `sqlite` — never a second connection) rather
// than through drizzle-orm/expo-sqlite, which is sync-only (see
// projections.ts's SyncSqliteDatabase comment) and would block the JS
// thread for anything beyond trivial reads.
//
// IMPORTANT — rollout status: these queries read the projection tables,
// which are only correct for an install if replaceProjection has run at
// least once against its *entire* ledger (see ingestion.ts's
// post-ingest projection write). Fresh installs populate these tables as
// ingestion runs before the dashboard data source reads them. A query error
// is surfaced by the data source; the UI does not silently substitute a
// second, derived set of numbers.
import { sqlite } from "./client";
import { fromMinorUnits } from "../lib/currency";
import { RECENCY_WINDOW_DAYS } from "../lib/subscriptions";
import type {
  CategoryTotal,
  DailyValue,
  DashboardAggregates,
  MonthlyValue,
  MonthTotalsByCurrency,
  SubscriptionSummary,
  TransactionSummary,
} from "../lib/dashboard-data";
export type {
  CategoryTotal,
  DailyValue,
  DashboardAggregates,
  MonthlyValue,
  MonthTotalsByCurrency,
  SubscriptionSummary,
} from "../lib/dashboard-data";
export { UNCATEGORIZED_TRANSACTION_LABEL } from "../lib/transaction-category";

// Only the async read method these queries actually use — a minimal
// structural interface (same principle as native-init.ts's
// ExecSyncCapable) rather than expo-sqlite's full SQLiteDatabase, so
// queries.test.ts can exercise these functions against a real
// better-sqlite3-backed adapter (which has no getAllAsync of its own,
// only sync methods) instead of needing a real Expo runtime.
type BindValue = string | number | null | boolean | Uint8Array | ArrayBuffer;

export interface AsyncQueryClient {
  getAllAsync<T>(source: string, params: BindValue[]): Promise<T[]>;
}

function defaultClient(): AsyncQueryClient {
  if (!sqlite) {
    throw new Error(
      "Local database is not available on this platform (see db/client.web.ts) — " +
        "these queries are Android-only, same as the rest of apps/native/db.",
    );
  }
  return sqlite;
}

function monthRange(now: Date): { start: number; end: number } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  return { start, end };
}

// Mirrors deriveDashboard's own monthIncomeByCurrency/monthExpenseByCurrency
// shape and rules exactly: grouped by currency (never summed across
// currencies — see lib/dashboard.ts's own comment on why), scoped to the
// calendar month containing `now`, using only rows this app's own
// projection considers a real income/expense transaction.
interface TotalRow {
  currency: string;
  direction: "income" | "expense";
  totalMinorUnits: number;
}

export async function queryMonthTotals(
  now: Date = new Date(),
  client: AsyncQueryClient = defaultClient(),
): Promise<MonthTotalsByCurrency> {
  const { start, end } = monthRange(now);
  const rows = await client.getAllAsync<TotalRow>(
    `SELECT currency, direction, SUM(amount_minor_units) AS totalMinorUnits
     FROM transactions
     WHERE date >= ? AND date < ? AND direction IN ('income', 'expense')
     GROUP BY currency, direction`,
    [start, end],
  );

  const incomeByCurrency: Record<string, number> = {};
  const expenseByCurrency: Record<string, number> = {};
  for (const row of rows) {
    const amount = fromMinorUnits(row.totalMinorUnits, row.currency);
    if (row.direction === "income") incomeByCurrency[row.currency] = amount;
    else expenseByCurrency[row.currency] = amount;
  }
  return { incomeByCurrency, expenseByCurrency };
}

// Mirrors dashboard-derived category breakdowns: expense-only, scoped to
// one currency at a time (never summed across currencies), and grouped by
// the canonical category written by the projection layer. Keeping the
// canonicalization at write time lets SQLite use the same value for grouping,
// filtering, and display without repeating UI normalization after every read.
export async function queryCategoryTotals(
  currency: string,
  now: Date = new Date(),
  client: AsyncQueryClient = defaultClient(),
): Promise<CategoryTotal[]> {
  return (await queryCategoryTotalsByCurrency([currency], now, client))[currency] ?? [];
}

// Day-detail reads are triggered directly by a user's tap on the calendar.
// Keep this path on expo-sqlite's async client: the Drizzle Expo driver is
// sync-only, so putting `async` on a Drizzle query does not move its SQLite
// work off the JS thread and can delay the calendar highlight itself.
export async function queryTransactionsForDay(
  dayStartMs: number,
  dayEndMs: number,
  currency: string,
  client: AsyncQueryClient = defaultClient(),
): Promise<TransactionSummary[]> {
  return client.getAllAsync<TransactionSummary>(
    `SELECT id,
            date,
            amount_minor_units AS amountMinorUnits,
            currency,
            direction,
            account_id AS accountId,
            trx_type_rich AS trxTypeRich,
            vendor,
            brand_name AS brandName,
            category,
            ref,
            bank_name AS bankName,
            mandate_id AS mandateId
     FROM transactions
     WHERE date >= ? AND date <= ? AND currency = ?
     ORDER BY date DESC, id DESC
     LIMIT 50`,
    [dayStartMs, dayEndMs, currency],
  );
}

interface CurrencyCategoryTotal extends CategoryTotal {
  currency: string;
}

export async function queryCategoryTotalsByCurrency(
  currencies: readonly string[],
  now: Date = new Date(),
  client: AsyncQueryClient = defaultClient(),
): Promise<Record<string, CategoryTotal[]>> {
  const uniqueCurrencies = [...new Set(currencies)];
  const result: Record<string, CategoryTotal[]> = Object.fromEntries(
    uniqueCurrencies.map((currency) => [currency, []]),
  );
  if (uniqueCurrencies.length === 0) return result;

  const { start, end } = monthRange(now);
  const placeholders = uniqueCurrencies.map(() => "?").join(", ");
  const rows = await client.getAllAsync<CurrencyCategoryTotal>(
    `SELECT currency,
            category,
            SUM(amount_minor_units) AS totalMinorUnits
     FROM transactions
     WHERE date >= ? AND date < ?
       AND direction = 'expense'
       AND currency IN (${placeholders})
     GROUP BY currency, category
     ORDER BY currency, totalMinorUnits DESC`,
    [start, end, ...uniqueCurrencies],
  );

  // The canonical category is written once by the projection layer, so SQL
  // can group and filter on exactly the same key the UI displays.
  const totalsByCurrency = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const totals = totalsByCurrency.get(row.currency) ?? new Map<string, number>();
    totals.set(row.category, (totals.get(row.category) ?? 0) + row.totalMinorUnits);
    totalsByCurrency.set(row.currency, totals);
  }
  for (const currency of uniqueCurrencies) {
    result[currency] = [...(totalsByCurrency.get(currency)?.entries() ?? [])]
      .sort(([, left], [, right]) => right - left)
      .map(([category, totalMinorUnits]) => ({ category, totalMinorUnits }));
  }
  return result;
}

export async function queryDashboardAggregates(
  currencies: readonly string[],
  now: Date = new Date(),
  client: AsyncQueryClient = defaultClient(),
): Promise<DashboardAggregates> {
  const uniqueCurrencies = [...new Set(currencies)];
  const { start, end } = monthRange(now);
  const categorySql =
    uniqueCurrencies.length === 0
      ? ""
      : `
       UNION ALL
       SELECT 'category' AS kind,
              currency,
              NULL AS direction,
              category,
              SUM(amount_minor_units) AS totalMinorUnits
       FROM transactions
       WHERE date >= ? AND date < ?
         AND direction = 'expense'
         AND currency IN (${uniqueCurrencies.map(() => "?").join(", ")})
       GROUP BY currency, category`;
  const params: BindValue[] = [start, end];
  if (uniqueCurrencies.length > 0) {
    params.push(start, end, ...uniqueCurrencies);
  }

  // One statement gives both result sets the same SQLite snapshot. Two
  // separately-awaited queries could straddle an atomic projection publish
  // and combine month totals from revision N with categories from N + 1.
  const rows = await client.getAllAsync<{
    kind: "month" | "category";
    currency: string;
    direction: "income" | "expense" | null;
    category: string | null;
    totalMinorUnits: number;
  }>(
    `SELECT 'month' AS kind,
            currency,
            direction,
            NULL AS category,
            SUM(amount_minor_units) AS totalMinorUnits
     FROM transactions
     WHERE date >= ? AND date < ? AND direction IN ('income', 'expense')
     GROUP BY currency, direction
     ${categorySql}`,
    params,
  );

  const monthTotals: MonthTotalsByCurrency = {
    incomeByCurrency: {},
    expenseByCurrency: {},
  };
  const categoryMinorUnits = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (row.kind === "month" && row.direction) {
      const amount = fromMinorUnits(row.totalMinorUnits, row.currency);
      if (row.direction === "income") monthTotals.incomeByCurrency[row.currency] = amount;
      else monthTotals.expenseByCurrency[row.currency] = amount;
      continue;
    }
    if (row.kind !== "category" || row.category === null) continue;
    const totals = categoryMinorUnits.get(row.currency) ?? new Map<string, number>();
    totals.set(row.category, (totals.get(row.category) ?? 0) + row.totalMinorUnits);
    categoryMinorUnits.set(row.currency, totals);
  }

  const categoryTotalsByCurrency: Record<string, CategoryTotal[]> = Object.fromEntries(
    uniqueCurrencies.map((currency) => [
      currency,
      [...(categoryMinorUnits.get(currency)?.entries() ?? [])]
        .sort(([, left], [, right]) => right - left)
        .map(([category, totalMinorUnits]) => ({ category, totalMinorUnits })),
    ]),
  );

  return { monthTotals, categoryTotalsByCurrency };
}

// Every currency with projected transaction or confirmed-account evidence.
// Replaces scanning
// dashboard.recent purely to collect currency codes (stores/dashboard-store.ts's
// dashboardCurrencies) — that scan held the entire message history in memory
// just to answer "which currencies exist," which this answers with one
// indexed query and no retention. The ORDER BY is part of the data contract:
// INR is the product primary whenever it is actually present. If it is not
// present, the most recently projected account balance/estimate defines the
// primary; remaining currencies use latest transaction recency and a
// case-insensitive code tie-breaker. This order is deterministic and never
// depends on SQLite's DISTINCT row order.
export async function queryDistinctCurrencies(
  client: AsyncQueryClient = defaultClient(),
): Promise<string[]> {
  const rows = await client.getAllAsync<{ currency: string }>(
    `WITH transaction_currencies AS (
       SELECT currency, MAX(date) AS latest_transaction_at
       FROM transactions
       WHERE currency IS NOT NULL AND TRIM(currency) <> ''
       GROUP BY currency
     ),
     account_currencies AS (
       SELECT currency,
              MAX(MAX(balance_as_of, estimated_as_of)) AS latest_account_at
       FROM accounts
       WHERE currency IS NOT NULL AND TRIM(currency) <> ''
       GROUP BY currency
     ),
     all_currencies AS (
       SELECT currency FROM transaction_currencies
       UNION
       SELECT currency FROM account_currencies
     )
     SELECT all_currencies.currency AS currency
     FROM all_currencies
     LEFT JOIN transaction_currencies transactions
       ON transactions.currency = all_currencies.currency
     LEFT JOIN account_currencies accounts
       ON accounts.currency = all_currencies.currency
     ORDER BY
       CASE
         WHEN all_currencies.currency = 'INR' THEN 0
         WHEN accounts.latest_account_at IS NOT NULL THEN 1
         ELSE 2
       END ASC,
       CASE
         WHEN accounts.latest_account_at IS NOT NULL THEN accounts.latest_account_at
         ELSE transactions.latest_transaction_at
       END DESC,
       CASE WHEN all_currencies.currency = 'INR' THEN 0 ELSE 1 END ASC,
       COALESCE(transactions.latest_transaction_at, 0) DESC,
       all_currencies.currency COLLATE NOCASE ASC`,
    [],
  );
  return rows.map((row) => row.currency);
}

interface DayRow {
  date: number;
  totalMinorUnits: number;
}

// Bucketed in JS, not SQL: insights-data.ts's buildDirectionSeries buckets by
// *local* calendar day (`new Date(y, m, d)`), and SQLite's own date functions
// operate in UTC with no local-timezone equivalent. Fetching the raw rows
// once and bucketing them the same way the JS version does is what makes the
// two provably match instead of silently drifting near a UTC/local day
// boundary. The row set is bounded by the caller's own date window, so this
// is nothing like the unbounded full-ledger scan it replaces.
function bucketDaily(rows: DayRow[], start: number, days: number): DailyValue[] {
  const totals = new Map<number, number>();
  const startDate = new Date(start);
  for (const row of rows) {
    const date = new Date(row.date);
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    totals.set(day, (totals.get(day) ?? 0) + row.totalMinorUnits);
  }
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate() + index,
    ).getTime();
    return { day, totalMinorUnits: totals.get(day) ?? 0 };
  });
}

// Mirrors insights-data.ts's buildDirectionSeries: `days` local-calendar-day
// buckets ending on `now`'s own day (inclusive), one currency and direction
// at a time.
export async function queryDailySeries(
  currency: string,
  direction: "income" | "expense",
  now: Date = new Date(),
  days = 14,
  client: AsyncQueryClient = defaultClient(),
): Promise<DailyValue[]> {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1).getTime();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const rows = await client.getAllAsync<{ date: number; amountMinorUnits: number }>(
    `SELECT date, amount_minor_units AS amountMinorUnits
     FROM transactions
     WHERE date >= ? AND date < ? AND direction = ? AND currency = ?`,
    [start, end, direction, currency],
  );
  return bucketDaily(
    rows.map((row) => ({ date: row.date, totalMinorUnits: row.amountMinorUnits })),
    start,
    days,
  );
}

// Mirrors insights-data.ts's buildMonthlyDirectionSeries: `months` calendar
// months ending on `now`'s own month (inclusive), one currency and direction
// at a time. Bucketed in JS for the same local-vs-UTC reason as
// queryDailySeries.
export async function queryMonthlySeries(
  currency: string,
  direction: "income" | "expense",
  now: Date = new Date(),
  months = 6,
  client: AsyncQueryClient = defaultClient(),
): Promise<MonthlyValue[]> {
  const count = Math.max(1, Math.floor(months));
  const start = new Date(now.getFullYear(), now.getMonth() - count + 1, 1).getTime();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const rows = await client.getAllAsync<{ date: number; amountMinorUnits: number }>(
    `SELECT date, amount_minor_units AS amountMinorUnits
     FROM transactions
     WHERE date >= ? AND date < ? AND direction = ? AND currency = ?`,
    [start, end, direction, currency],
  );

  const totals = new Map<number, number>();
  for (const row of rows) {
    const date = new Date(row.date);
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
    totals.set(monthStart, (totals.get(monthStart) ?? 0) + row.amountMinorUnits);
  }

  return Array.from({ length: count }, (_, index) => {
    const monthOffset = index - count + 1;
    const monthStart = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1).getTime();
    return { monthStart, totalMinorUnits: totals.get(monthStart) ?? 0 };
  });
}

interface SubscriptionRow {
  id: string;
  merchant: string;
  amountMinorUnits: number;
  currency: string;
  count: number;
  lastDate: number;
  confidence: "likely" | "possible";
}

// Reads the persisted subscriptions projection (db/projections.ts writes
// this from lib/subscriptions.ts's deriveSubscriptions output — the
// heuristic itself is never re-run here). Recency is a query-time filter
// against the injected clock, not a write-time one, so a subscription can
// expire with no new SMS and no projection republish — the same
// RECENCY_WINDOW_DAYS constant deriveSubscriptions itself uses, imported
// rather than restated, so the two can't silently disagree.
export async function querySubscriptions(
  now: Date = new Date(),
  client: AsyncQueryClient = defaultClient(),
): Promise<SubscriptionSummary[]> {
  const recencyThreshold = now.getTime() - RECENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const rows = await client.getAllAsync<SubscriptionRow>(
    `SELECT id, merchant, amount_minor_units AS amountMinorUnits, currency, count,
            last_date AS lastDate, confidence
     FROM subscriptions
     WHERE last_date >= ?
     ORDER BY last_date DESC`,
    [recencyThreshold],
  );
  return rows;
}
