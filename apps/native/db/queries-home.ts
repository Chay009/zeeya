// SQL query functions backing lib/dashboard-data.ts's HomeReadModel/
// HomeDataSource (Phase 1B.4 sub-slice 3) — see that file's own "Home read
// model" section comment for the full contract. Uses expo-sqlite's async
// getAllAsync (db/queries.ts's AsyncQueryClient pattern) for every query
// here: nearly all of them need aggregation, window functions, or
// json_group_array, which drizzle-orm's sync SQLite query builder handles
// awkwardly or not at all (see db/queries.ts's own top comment for why that
// file made the same choice).
//
// No query here ever joins sms_ledger — every field HomeReadModel needs
// already lives on accounts/detectedAccounts/balanceReadings/transactions/
// activity/mandates/mandateEvents/subscriptions. That's an explicit
// deliverable of a later sub-slice (6); this file must not quietly start
// depending on the ledger to get there.
import { sqlite } from "./client";
import { STORED_ACTIVITY_CATEGORIES } from "../lib/activity-filters";
import { AMOUNT_TOLERANCE_RATIO, RECENCY_WINDOW_DAYS } from "../lib/subscriptions";
import { readConsistentSnapshot } from "./projection-snapshot";
import { queryHomeHighlights } from "./queries-home-highlights";
import {
  queryDashboardAggregates,
  queryDistinctCurrencies,
  type AsyncQueryClient,
} from "./queries";
import { queryDetectedAccountsUnsafe } from "./queries-accounts";
import type {
  ActivityCategory,
  CategoryTotal,
  HomeAccountSummary,
  HomeActivityCategoryCount,
  HomeActivityDetailTarget,
  HomeActivityItem,
  HomeCalendarCursor,
  HomeCalendarDay,
  HomeCalendarMonth,
  HomeCalendarMonthsPage,
  HomeCalendarMonthsQuery,
  HomeDataSource,
  HomeFlowDay,
  HomeMandatePreview,
  HomeReadModel,
  HomeReadModelQuery,
  HomeRecentActivityQuery,
  HomeSubscriptionOverview,
  HomeSubscriptionPreviewItem,
  HomeUnassignedReadingSummary,
  MandateEventSummary,
  SubscriptionSummary,
} from "../lib/dashboard-data";

function defaultClient(): AsyncQueryClient {
  if (!sqlite) {
    throw new Error(
      "Local database is not available on this platform (see db/client.web.ts) — " +
        "these queries are Android-only, same as the rest of apps/native/db.",
    );
  }
  return sqlite;
}

// ── Tunable bounds ───────────────────────────────────────────────────────
// Documented judgment calls — see this sub-slice's own report for why each
// value was picked; none of these come from an explicit prior spec number.

// "Load earlier months" pagination default/cap for loadCalendarMonths — the
// user's own prior direction calls for "a bounded 24-month window for the
// initial Home model."
export const HOME_CALENDAR_DEFAULT_MONTHS_BACK = 24;
export const HOME_CALENDAR_MAX_MONTHS_BACK = 60;

// A handful of recent lifecycle events per mandate preview card — enough to
// show a short timeline without turning HomeReadModel.load() into an
// unbounded per-mandate history fetch. Matches this sub-slice's own brief.
export const HOME_MANDATE_RECENT_EVENTS_LIMIT = 5;

// Combined mandate+subscription preview cap for HomeSubscriptionOverview.
// items — a small "preview cards" list, not the full paginated
// mandates.list()/subscriptions.list() surfaces. activeCount/cancelledCount/
// totalsByCurrency are computed separately by full-table aggregation
// specifically so this cap can never silently under-report those.
export const HOME_SUBSCRIPTION_PREVIEW_LIMIT = 20;

// Home's own unfiltered ("all" pill) activity preview — mirrors
// features/home-preview/data.ts's buildActivity `allItems.slice(0, 5)`.
export const HOME_RECENT_ACTIVITY_DEFAULT_LIMIT = 5;
export const HOME_RECENT_ACTIVITY_MAX_LIMIT = 100;
// Cap for a period-scoped read (the Transactions tab's month). Well above a
// heavy user's monthly transaction count, and — with stage 2's IN list — kept
// under SQLite's 999 bound-parameter ceiling on older Android builds.
export const HOME_ACTIVITY_PERIOD_MAX_LIMIT = 900;

// The bounded, filter-specific loadRecentActivity default — larger than the
// Home preview's 5 since this backs an on-demand pill selection, not the
// always-visible unfiltered preview.
export const HOME_LOAD_RECENT_ACTIVITY_DEFAULT_LIMIT = 20;

function validatedPositiveInt(value: number, max: number, label: string): number {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${label} must be an integer from 1 to ${max}, got ${value}`);
  }
  return value;
}

// ── accounts / detectedAccounts / unassignedReadings ────────────────────

interface AccountRow {
  id: string;
  bankName: string;
  bankKey: string;
  last4: string;
  currency: string;
  anchorStatus: "reported" | "unreported";
  balanceMinorUnits: number | null;
  balanceAsOf: number;
  balanceSender: string;
  estimatedBalanceMinorUnits: number | null;
  estimatedAsOf: number;
  reconciliationDeltaMinorUnits: number | null;
  capturedIncomeMinorUnits: number;
  capturedExpenseMinorUnits: number;
  capturedChangeMinorUnits: number;
  capturedTransactionCount: number;
}

// Every confirmed account, each carrying hasNewerSuggestedReading — true
// iff an unassigned/suggested balance_readings row exists for this
// account's normalized bank+currency, dated after this account's own
// balanceAsOf, AND this account is the sole account sharing that
// bank+currency (dashboard.ts's own "sole-account" suggestion rule — see
// lib/dashboard.ts's banksByKey/unassignedReadingsByBank loop). Computed by
// counting, per (bank_key, currency), how many accounts share it (via a
// window COUNT(*) OVER (PARTITION BY bank_key, currency)) and whether any
// qualifying unassigned reading exists newer than this account's own
// balance_as_of — both in one query, no per-account round trip.
export async function queryHomeAccounts(
  client: AsyncQueryClient = defaultClient(),
): Promise<HomeAccountSummary[]> {
  const rows = await client.getAllAsync<
    AccountRow & { siblingCount: number; hasNewerSuggestedReading: number }
  >(
    `SELECT
       a.id AS id,
       a.bank_name AS bankName,
       a.bank_key AS bankKey,
       a.last4 AS last4,
       a.currency AS currency,
       a.anchor_status AS anchorStatus,
       a.balance_minor_units AS balanceMinorUnits,
       a.balance_as_of AS balanceAsOf,
       a.balance_sender AS balanceSender,
       a.estimated_balance_minor_units AS estimatedBalanceMinorUnits,
       a.estimated_as_of AS estimatedAsOf,
       a.reconciliation_delta_minor_units AS reconciliationDeltaMinorUnits,
       a.captured_income_minor_units AS capturedIncomeMinorUnits,
       a.captured_expense_minor_units AS capturedExpenseMinorUnits,
       a.captured_change_minor_units AS capturedChangeMinorUnits,
       a.captured_transaction_count AS capturedTransactionCount,
       (SELECT COUNT(*) FROM accounts sib
          WHERE sib.bank_key = a.bank_key AND sib.currency = a.currency) AS siblingCount,
       EXISTS (
         SELECT 1 FROM balance_readings br
         WHERE br.account_id IS NULL
           AND br.detected_bank_key = a.bank_key
           AND br.currency = a.currency
           AND br.as_of > a.balance_as_of
       ) AS hasNewerSuggestedReading
     FROM accounts a
     ORDER BY MAX(a.balance_as_of, a.estimated_as_of) DESC, a.id ASC`,
    [],
  );

  return rows.map((row) => ({
    id: row.id,
    bankName: row.bankName,
    last4: row.last4,
    currency: row.currency,
    anchorStatus: row.anchorStatus,
    balanceMinorUnits: row.balanceMinorUnits,
    balanceAsOf: row.balanceAsOf,
    balanceSender: row.balanceSender,
    estimatedBalanceMinorUnits: row.estimatedBalanceMinorUnits,
    estimatedAsOf: row.estimatedAsOf,
    reconciliationDeltaMinorUnits: row.reconciliationDeltaMinorUnits,
    capturedIncomeMinorUnits: row.capturedIncomeMinorUnits,
    capturedExpenseMinorUnits: row.capturedExpenseMinorUnits,
    capturedChangeMinorUnits: row.capturedChangeMinorUnits,
    capturedTransactionCount: row.capturedTransactionCount,
    // Only a sole candidate (siblingCount === 1) can ever be "suggested"
    // against — two accounts sharing bank+currency have no sole candidate,
    // so neither gets true even if hasNewerSuggestedReading's own EXISTS
    // found a qualifying row.
    hasNewerSuggestedReading: row.siblingCount === 1 && row.hasNewerSuggestedReading === 1,
  }));
}

interface UnassignedRow {
  id: string;
  accountId: string | null;
  balanceMinorUnits: number;
  currency: string;
  asOf: number;
  detectedBankName: string;
  detectedAccount: string | null;
  associationKind: "confirmed" | "suggested" | "unassigned";
  sender: string;
  reconciliationPreviousAsOf: number | null;
  reconciliationExpectedBalanceMinorUnits: number | null;
  reconciliationDeltaMinorUnits: number | null;
  capturedIncomeMinorUnits: number | null;
  capturedExpenseMinorUnits: number | null;
  capturedTransactionCount: number | null;
}

// One latest unassigned/suggested reading per distinct bank (grouped by
// detectedBankKey, across every bank with any such reading — not scoped to
// a single bank the way accounts.listUnassignedReadings is). Mirrors
// buildAccountPreviews's own `bank.unassignedReadings[0]` selection: within
// a bank, the newest reading by (asOf, id); across banks, the whole
// returned array is asOf-descending.
export async function queryHomeUnassignedReadings(
  client: AsyncQueryClient = defaultClient(),
): Promise<HomeUnassignedReadingSummary[]> {
  const rows = await client.getAllAsync<UnassignedRow & { bankName: string }>(
    `SELECT br.id AS id,
            br.account_id AS accountId,
            br.balance_minor_units AS balanceMinorUnits,
            br.currency AS currency,
            br.as_of AS asOf,
            br.detected_bank_name AS detectedBankName,
            br.detected_bank_name AS bankName,
            br.detected_account AS detectedAccount,
            br.association_kind AS associationKind,
            br.sender AS sender,
            br.reconciliation_previous_as_of AS reconciliationPreviousAsOf,
            br.reconciliation_expected_balance_minor_units AS reconciliationExpectedBalanceMinorUnits,
            br.reconciliation_delta_minor_units AS reconciliationDeltaMinorUnits,
            br.captured_income_minor_units AS capturedIncomeMinorUnits,
            br.captured_expense_minor_units AS capturedExpenseMinorUnits,
            br.captured_transaction_count AS capturedTransactionCount
     FROM balance_readings br
     WHERE br.account_id IS NULL
       AND br.id IN (
         SELECT id FROM (
           SELECT id,
                  ROW_NUMBER() OVER (
                    PARTITION BY detected_bank_key
                    ORDER BY as_of DESC, id DESC
                  ) AS rn
           FROM balance_readings
           WHERE account_id IS NULL
         ) ranked
         WHERE ranked.rn = 1
       )
     ORDER BY br.as_of DESC, br.id DESC`,
    [],
  );
  return rows;
}

// ── flowDays ──────────────────────────────────────────────────────────────

interface FlowRawRow {
  date: number;
  direction: "income" | "expense" | "neutral";
  amountMinorUnits: number;
}

// Bucketed in JS, not SQL — same local-calendar-day reasoning as
// db/queries.ts's queryDailySeries/bucketDaily (SQLite's date functions
// operate in UTC with no local-timezone equivalent). Last 7 local days
// ending on `at`'s own day (inclusive), one currency at a time.
export async function queryHomeFlowDays(
  currency: string,
  at: Date,
  client: AsyncQueryClient = defaultClient(),
  accountId?: string,
): Promise<HomeFlowDay[]> {
  const today = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6).getTime();
  // The next local midnight via the Date(year, month, day + 1) constructor,
  // not `today.getTime() + 24h` — a fixed 24h offset is wrong across a DST
  // transition (a local day can be 23 or 25 real hours), matching
  // db/queries.ts's queryDailySeries's own end-of-window calculation.
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).getTime();

  const rows = await client.getAllAsync<FlowRawRow>(
    accountId
      ? `SELECT date, direction, amount_minor_units AS amountMinorUnits
         FROM transactions
         WHERE currency = ? AND account_id = ? AND date >= ? AND date < ?
           AND direction IN ('income', 'expense')`
      : `SELECT date, direction, amount_minor_units AS amountMinorUnits
         FROM transactions
         WHERE currency = ? AND date >= ? AND date < ? AND direction IN ('income', 'expense')`,
    accountId ? [currency, accountId, start, end] : [currency, start, end],
  );

  const income = new Map<number, number>();
  const expense = new Map<number, number>();
  for (const row of rows) {
    const d = new Date(row.date);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const bucket = row.direction === "income" ? income : expense;
    bucket.set(day, (bucket.get(day) ?? 0) + row.amountMinorUnits);
  }

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - 6 + index,
    ).getTime();
    return {
      day,
      incomeMinorUnits: income.get(day) ?? 0,
      expenseMinorUnits: expense.get(day) ?? 0,
    };
  });
}

// ── calendarMonths ────────────────────────────────────────────────────────

function monthStartOf(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

function addMonths(monthStartMs: number, delta: number): number {
  const d = new Date(monthStartMs);
  return new Date(d.getFullYear(), d.getMonth() + delta, 1).getTime();
}

interface LocalDayTotalRow {
  localDay: string; // 'YYYY-MM-DD' in the device's own local timezone
  direction: "income" | "expense";
  totalMinorUnits: number;
}

// Parses a `strftime('%Y-%m-%d', ..., 'localtime')` key back into the same
// local-midnight epoch ms `new Date(y, m, d).getTime()` would produce for
// that calendar date — never re-parsed through `new Date(string)`, whose
// ISO-8601 parsing treats a bare "YYYY-MM-DD" as UTC midnight, not local.
function localDayKeyToEpoch(localDay: string): number {
  const [year, month, day] = localDay.split("-").map(Number);
  return new Date(year!, month! - 1, day!).getTime();
}

export async function queryHomeCalendarMonths(
  query: HomeCalendarMonthsQuery,
  client: AsyncQueryClient = defaultClient(),
): Promise<HomeCalendarMonthsPage> {
  const monthsBack = validatedPositiveInt(
    query.monthsBack ?? HOME_CALENDAR_DEFAULT_MONTHS_BACK,
    HOME_CALENDAR_MAX_MONTHS_BACK,
    "Home calendar months-back",
  );

  // The window's newest month is either the cursor's own month minus one
  // (paging further back) or `at`'s own month (the initial page).
  const newestMonthStart = query.cursor
    ? addMonths(query.cursor.monthStart, -1)
    : monthStartOf(new Date(query.at));
  const oldestMonthStart = addMonths(newestMonthStart, -(monthsBack - 1));
  const windowStart = oldestMonthStart;
  const windowEnd = addMonths(newestMonthStart, 1);

  const monthKeys: number[] = Array.from({ length: monthsBack }, (_, index) =>
    addMonths(oldestMonthStart, index),
  );

  // Aggregated by SQL, not fetched as raw rows: strftime's 'localtime'
  // modifier converts the stored UTC-epoch-ms column into the SQLite
  // process's own local timezone (the same timezone the device — and this
  // whole on-device app — actually runs in, unlike a server process), so
  // this produces the identical local-calendar-day bucketing
  // db/queries.ts's queryDailySeries/queryMonthlySeries compute in JS,
  // without ever materializing more than one row per (local day, direction)
  // — at most ~2 * 31 * monthsBack rows, never one row per transaction.
  const dayRows = await client.getAllAsync<LocalDayTotalRow>(
    query.accountId
      ? `SELECT strftime('%Y-%m-%d', date / 1000, 'unixepoch', 'localtime') AS localDay,
                direction,
                SUM(amount_minor_units) AS totalMinorUnits
         FROM transactions
         WHERE currency = ? AND account_id = ? AND date >= ? AND date < ?
           AND direction IN ('income', 'expense')
         GROUP BY localDay, direction`
      : `SELECT strftime('%Y-%m-%d', date / 1000, 'unixepoch', 'localtime') AS localDay,
                direction,
                SUM(amount_minor_units) AS totalMinorUnits
         FROM transactions
         WHERE currency = ? AND date >= ? AND date < ? AND direction IN ('income', 'expense')
         GROUP BY localDay, direction`,
    query.accountId
      ? [query.currency, query.accountId, windowStart, windowEnd]
      : [query.currency, windowStart, windowEnd],
  );

  const dayTotals = new Map<number, { income: number; expense: number }>();
  for (const row of dayRows) {
    const dayStart = localDayKeyToEpoch(row.localDay);
    const bucket = dayTotals.get(dayStart) ?? { income: 0, expense: 0 };
    if (row.direction === "income") bucket.income += row.totalMinorUnits;
    else bucket.expense += row.totalMinorUnits;
    dayTotals.set(dayStart, bucket);
  }

  const items: HomeCalendarMonth[] = monthKeys.map((monthStart) => {
    const days: HomeCalendarDay[] = [];
    let monthIncome = 0;
    let monthExpense = 0;
    const monthEnd = addMonths(monthStart, 1);
    for (const [day, dayValue] of dayTotals) {
      if (day < monthStart || day >= monthEnd) continue;
      monthIncome += dayValue.income;
      monthExpense += dayValue.expense;
      if (dayValue.income !== 0 || dayValue.expense !== 0) {
        days.push({ day, incomeMinorUnits: dayValue.income, expenseMinorUnits: dayValue.expense });
      }
    }
    days.sort((a, b) => a.day - b.day);
    return {
      monthStart,
      incomeMinorUnits: monthIncome,
      expenseMinorUnits: monthExpense,
      days,
    };
  });

  // Real bounded-history check: does any transaction exist strictly before
  // this page's oldest month, for this currency? One cheap EXISTS query,
  // never a full-history scan/materialization.
  const existsRows = await client.getAllAsync<{ found: number }>(
    query.accountId
      ? `SELECT EXISTS (
           SELECT 1 FROM transactions
           WHERE currency = ? AND account_id = ? AND date < ?
         ) AS found`
      : `SELECT EXISTS (
           SELECT 1 FROM transactions WHERE currency = ? AND date < ?
         ) AS found`,
    query.accountId
      ? [query.currency, query.accountId, windowStart]
      : [query.currency, windowStart],
  );
  const hasEarlierHistory = (existsRows[0]?.found ?? 0) === 1;
  const nextCursor: HomeCalendarCursor | null = hasEarlierHistory
    ? { monthStart: oldestMonthStart }
    : null;

  return { items, nextCursor };
}

// ── subscriptionOverview ─────────────────────────────────────────────────

interface MandatePreviewRow {
  mandateId: string;
  merchant: string;
  amountMinorUnits: number | null;
  currency: string;
  status: "active" | "cancelled";
  createdAt: number;
  lastUpdated: number;
  sender: string;
  reactivated: number;
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

// Home's subscription/mandate preview no longer sorts by an alphabetical
// previewKey (mandate:.../subscription:...) — that string was itself built
// two different, disagreeing ways in this codebase (SQL reused
// subscriptions.id's normalizeMerchant()-based form, while the legacy UI's
// own `normalized()` in features/home-preview/data.ts doesn't strip a
// trailing .com/.in/.co first, so e.g. "Netflix.com" normalized
// differently on each side and could change top-20 membership). Recency is
// the correct, single, already-indexed ordering instead.
//
// Each side is fetched via its own indexed, LIMIT-bounded query, already in
// (sortAt DESC, id DESC) order per mandates_last_updated_mandate_id_idx /
// subscriptions_last_date_id_idx — SQLite's own BINARY collation on `id`.
// The merge below is a genuine two-pointer merge of those two
// already-sorted lists, not a second JS-side sort: it compares ONLY
// sortAt (a plain number — no collation involved) between the two list
// heads, and otherwise advances whichever source list is ahead — it never
// re-orders the ids WITHIN one source's own list. On an EXACT cross-source
// sortAt tie, mandate wins (see mergePreviewCandidatesByRecency's own
// comment for why that specific choice, not a `(sortAt DESC, kind DESC, id
// DESC)` string-ordered contract this file described in an earlier round —
// that description is superseded by the explicit policy documented on the
// merge function itself, which is what the code actually implements and
// what its own tests assert). A prior version instead flattened both lists
// and re-sorted them
// together in JS using `id.localeCompare()` as the final tiebreaker, which
// silently invalidated the "identical comparator" proof: SQL's LIMIT
// pre-cut each side using BINARY id ordering, but the JS re-sort could
// then reorder within a source by locale-aware id comparison — for
// mixed-case or punctuation-bearing ids, BINARY and localeCompare can
// disagree, so the "top N from each source is provably sufficient" claim
// no longer held once the merge itself used a different ordering than the
// SQL that produced those N candidates.
function mergePreviewCandidatesByRecency<
  M extends { sortAt: number },
  S extends { sortAt: number },
>(
  mandateEntries: readonly M[],
  subscriptionEntries: readonly S[],
  limit: number,
): (({ kind: "mandate" } & M) | ({ kind: "subscription" } & S))[] {
  const merged: (({ kind: "mandate" } & M) | ({ kind: "subscription" } & S))[] = [];
  let m = 0;
  let s = 0;
  while (merged.length < limit && (m < mandateEntries.length || s < subscriptionEntries.length)) {
    const mandate = mandateEntries[m];
    const subscription = subscriptionEntries[s];
    // Only sortAt (a number) ever decides order between the two sources —
    // never an id comparison, which is exactly what would reintroduce a
    // collation mismatch against SQL's own BINARY-ordered LIMIT. On an
    // EXACT sortAt tie between a mandate and a subscription, mandate wins
    // — an explicit, tested policy (see this function's own equal-
    // timestamp cross-source test), not an incidental side effect of `>=`.
    // There is no product requirement dictating which kind should win a
    // cross-source tie; mandate was chosen for determinism and is the one
    // documented and enforced here.
    if (mandate && (!subscription || mandate.sortAt >= subscription.sortAt)) {
      merged.push({ kind: "mandate", ...mandate });
      m++;
    } else if (subscription) {
      merged.push({ kind: "subscription", ...subscription });
      s++;
    }
  }
  return merged;
}

// Fetching HOME_SUBSCRIPTION_PREVIEW_LIMIT candidates from EACH source
// (not just enough to fill the final cap) is what makes the merge above
// provably correct rather than "probably enough overlap": the true
// combined top-N can never include a row ranked below position N within
// its own source's identically-ordered fetch. A single cross-table
// `UNION ALL ... ORDER BY ... LIMIT` was tried and rejected: EXPLAIN QUERY
// PLAN showed SQLite adds its own temp b-tree per UNION leg and does not
// push the LIMIT into either branch, so it scans both tables in full
// regardless.
async function queryMandatePreviewCandidates(
  client: AsyncQueryClient,
  limit: number,
): Promise<MandatePreviewRow[]> {
  return client.getAllAsync<MandatePreviewRow>(
    `SELECT m.mandate_id AS mandateId,
            m.merchant AS merchant,
            m.amount_minor_units AS amountMinorUnits,
            m.currency AS currency,
            m.status AS status,
            m.created_at AS createdAt,
            m.last_updated AS lastUpdated,
            m.sender AS sender,
            (m.status = 'active' AND EXISTS (
              SELECT 1 FROM mandate_events me
              WHERE me.mandate_id = m.mandate_id AND me.status = 'cancelled'
            )) AS reactivated
     FROM mandates m
     ORDER BY m.last_updated DESC, m.mandate_id DESC
     LIMIT ?`,
    [limit],
  );
}

async function querySubscriptionPreviewCandidates(
  client: AsyncQueryClient,
  now: Date,
  limit: number,
): Promise<SubscriptionRow[]> {
  const recencyThreshold = now.getTime() - RECENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return client.getAllAsync<SubscriptionRow>(
    `SELECT id, merchant, amount_minor_units AS amountMinorUnits, currency, count,
            last_date AS lastDate, confidence
     FROM subscriptions
     WHERE last_date >= ?
     ORDER BY last_date DESC, id DESC
     LIMIT ?`,
    [recencyThreshold, limit],
  );
}

async function queryRecentEventsForMandates(
  client: AsyncQueryClient,
  mandateIds: readonly string[],
): Promise<Map<string, MandateEventSummary[]>> {
  const result = new Map<string, MandateEventSummary[]>();
  if (mandateIds.length === 0) return result;
  const placeholders = mandateIds.map(() => "?").join(", ");
  const rows = await client.getAllAsync<MandateEventSummary & { rn: number }>(
    `SELECT id, mandate_id AS mandateId, status, date, sender, rn FROM (
       SELECT id, mandate_id, status, date, sender,
              ROW_NUMBER() OVER (
                PARTITION BY mandate_id ORDER BY date DESC, id DESC
              ) AS rn
       FROM mandate_events
       WHERE mandate_id IN (${placeholders})
     ) ranked
     WHERE rn <= ?
     ORDER BY mandateId, rn`,
    [...mandateIds, HOME_MANDATE_RECENT_EVENTS_LIMIT],
  );
  for (const row of rows) {
    const list = result.get(row.mandateId) ?? [];
    list.push({
      id: row.id,
      mandateId: row.mandateId,
      status: row.status,
      date: row.date,
      sender: row.sender,
    });
    result.set(row.mandateId, list);
  }
  return result;
}

interface CurrencyTotalRow {
  currency: string;
  totalMinorUnits: number;
}

// Every subscription read here is scoped to `last_date >= recencyThreshold`
// — mirrors dashboard.ts's own derivation boundary (querySubscriptions/
// deriveDashboard already recency-filter before dashboard.subscriptions
// ever reaches buildSubscriptions/subscriptionMonthlyTotals), so an aged-out
// subscription must not count toward totalsByCurrency, activeCount, or the
// preview candidates here even though the row itself is never deleted (see
// schema.ts's subscriptions table comment).
export async function queryHomeSubscriptionOverview(
  now: Date,
  client: AsyncQueryClient = defaultClient(),
): Promise<HomeSubscriptionOverview> {
  const recencyThreshold = now.getTime() - RECENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const [
    mandateCandidates,
    subscriptionCandidates,
    subscriptionTotalRows,
    activeMandateTotalRows,
    activeMandateCountRows,
    cancelledMandateCountRows,
    activeSubscriptionCountRows,
  ] = await Promise.all([
    // Each side's own indexed top-N (see comparePreviewCandidates's own
    // comment for why fetching HOME_SUBSCRIPTION_PREVIEW_LIMIT from EACH
    // side, then merging with the identical final comparator, is provably
    // correct — not merely a generous over-fetch).
    queryMandatePreviewCandidates(client, HOME_SUBSCRIPTION_PREVIEW_LIMIT),
    querySubscriptionPreviewCandidates(client, now, HOME_SUBSCRIPTION_PREVIEW_LIMIT),
    // Full-table aggregation — likely-confidence, non-expired subscriptions
    // only, per subscriptions.ts's subscriptionMonthlyTotals rule applied to
    // dashboard.ts's already-recency-filtered dashboard.subscriptions.
    client.getAllAsync<CurrencyTotalRow>(
      `SELECT currency, SUM(amount_minor_units) AS totalMinorUnits
         FROM subscriptions
         WHERE confidence = 'likely' AND last_date >= ?
         GROUP BY currency`,
      [recencyThreshold],
    ),
    // Full-table aggregation — active mandates with a known amount.
    client.getAllAsync<CurrencyTotalRow>(
      `SELECT currency, SUM(amount_minor_units) AS totalMinorUnits
         FROM mandates
         WHERE status = 'active' AND amount_minor_units IS NOT NULL
         GROUP BY currency`,
      [],
    ),
    client.getAllAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM mandates WHERE status = 'active'`,
      [],
    ),
    client.getAllAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM mandates WHERE status = 'cancelled'`,
      [],
    ),
    client.getAllAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM subscriptions WHERE last_date >= ?`,
      [recencyThreshold],
    ),
  ]);

  const mandateIds = mandateCandidates.map((row) => row.mandateId);
  const eventsByMandate = await queryRecentEventsForMandates(client, mandateIds);

  const mandateEntries = mandateCandidates.map((row) => ({ sortAt: row.lastUpdated, row }));
  const subscriptionEntries = subscriptionCandidates.map((row) => ({
    sortAt: row.lastDate,
    row,
  }));

  const merged = mergePreviewCandidatesByRecency(
    mandateEntries,
    subscriptionEntries,
    HOME_SUBSCRIPTION_PREVIEW_LIMIT,
  );

  const items: HomeSubscriptionPreviewItem[] = merged.map((entry): HomeSubscriptionPreviewItem => {
    if (entry.kind === "mandate") {
      const row = entry.row;
      const preview: HomeMandatePreview = {
        mandateId: row.mandateId,
        merchant: row.merchant,
        amountMinorUnits: row.amountMinorUnits,
        currency: row.currency,
        status: row.status,
        createdAt: row.createdAt,
        lastUpdated: row.lastUpdated,
        sender: row.sender,
        recentEvents: eventsByMandate.get(row.mandateId) ?? [],
        reactivated: row.reactivated === 1,
      };
      return { kind: "mandate", ...preview };
    }
    const row = entry.row;
    const summary: SubscriptionSummary = {
      id: row.id,
      merchant: row.merchant,
      amountMinorUnits: row.amountMinorUnits,
      currency: row.currency,
      count: row.count,
      lastDate: row.lastDate,
      confidence: row.confidence,
    };
    return { kind: "subscription", ...summary };
  });

  const totalsByCurrency: Record<string, number> = {};
  for (const row of subscriptionTotalRows) {
    totalsByCurrency[row.currency] = (totalsByCurrency[row.currency] ?? 0) + row.totalMinorUnits;
  }
  for (const row of activeMandateTotalRows) {
    totalsByCurrency[row.currency] = (totalsByCurrency[row.currency] ?? 0) + row.totalMinorUnits;
  }

  const activeMandateCount = activeMandateCountRows[0]?.count ?? 0;
  const activeSubscriptionCount = activeSubscriptionCountRows[0]?.count ?? 0;
  const cancelledCount = cancelledMandateCountRows[0]?.count ?? 0;

  return {
    items,
    totalsByCurrency,
    activeCount: activeMandateCount + activeSubscriptionCount,
    cancelledCount,
  };
}

// ── recentActivity / activityCategoryCounts / totalActivityCount ────────

interface ActivityGroupedRow {
  smsId: string;
  date: number;
  categories: string;
  bankName: string | null;
  brandName: string | null;
  vendor: string | null;
  bene: string | null;
  merchantCategory: string | null;
  sender: string;
  trxTypeRich: string | null;
  subcategory: string | null;
  mandateEvent: "active" | "cancelled" | null;
  isFromCard: number;
  amountMinorUnits: number | null;
  currency: string | null;
  direction: "income" | "expense" | "neutral" | null;
  minCategory: string;
  accountId: string | null;
  transactionId: string | null;
  isRecurring: number;
}

// A message can match at most one activity row per distinct category (see
// schema.ts's activity_sms_category_idx unique index), so a single smsId
// can never occupy more than one activity row per category
// STORED_ACTIVITY_CATEGORIES lists (lib/activity-filters.ts — the single
// canonical stored-category tuple db/schema.ts's Drizzle column enum and
// its activity_category_check CHECK constraint are BOTH also derived from,
// so this factor, the schema's own enum, and its CHECK can never drift
// apart from each other). Deriving the over-fetch factor from that tuple's
// own length, rather than a hand-copied "10", means adding an eleventh
// category can never silently under-fetch and reduce result count.
// Over-fetching by this factor before deduplicating by smsId guarantees
// enough candidates to find `limit` distinct smsIds in one bounded round
// trip, without an unbounded scan.
const ACTIVITY_CANDIDATE_OVER_FETCH_FACTOR = STORED_ACTIVITY_CATEGORIES.length;

// Required two-stage SQL — see HomeRecentActivityQuery's own comment in
// lib/dashboard-data.ts for why a single filtered GROUP BY would silently
// erase a multi-category message's other categories. Stage 1 selects a
// BOUNDED, index-ordered candidate window (plain ORDER BY + LIMIT as its own
// top-level statement — SQLite's LIMIT-pushdown optimization only applies to
// a standalone query, not one wrapped in GROUP BY or a subquery/view; see
// this function's own test coverage for the EXPLAIN QUERY PLAN proof), then
// deduplicates by smsId in JS, keeping only the first `limit` distinct ones
// in the window's own newest-first order. A single filtered/grouped query
// (the earlier approach) forces SQLite to scan and group the ENTIRE table
// before LIMIT can trim anything — unbounded work against a table that only
// grows. Stage 2 then aggregates ALL activity rows for exactly the
// resulting smsIds.
interface ActivityRowsScope {
  category?: ActivityCategory;
  accountId?: string;
  /** Inclusive lower / exclusive upper bound on activity.date (epoch ms). */
  from?: number;
  to?: number;
  /** Only messages that carry a transaction amount. */
  transactionsOnly?: boolean;
}

async function queryHomeActivityRows(
  client: AsyncQueryClient,
  scope: ActivityRowsScope,
  limit: number,
  at: Date,
): Promise<HomeActivityItem[]> {
  const candidateLimit = limit * ACTIVITY_CANDIDATE_OVER_FETCH_FACTOR;
  // Built from parts, but for every scope the shape stays index-served:
  // equality columns lead (category / account_id), `date` follows as a
  // range + ORDER BY, and the tiebreaker matches the index — account-scoped
  // reads use activity_account_id_date_id_idx (date, id), the rest the
  // (…, date, sms_id) indexes. See this function's EXPLAIN coverage.
  const where: string[] = [];
  const stage1Params: (string | number)[] = [];
  if (scope.category) {
    where.push("category = ?");
    stage1Params.push(scope.category);
  }
  if (scope.accountId) {
    where.push("account_id = ?");
    stage1Params.push(scope.accountId);
  }
  if (scope.from !== undefined) {
    where.push("date >= ?");
    stage1Params.push(scope.from);
  }
  if (scope.to !== undefined) {
    where.push("date < ?");
    stage1Params.push(scope.to);
  }
  // Financial activity rows always carry an amount (activity_financial_
  // fields_check), so this is exactly "rows that are transactions".
  if (scope.transactionsOnly) where.push("amount_minor_units IS NOT NULL");
  stage1Params.push(candidateLimit);
  const stage1Sql = `SELECT sms_id AS smsId, date
     FROM activity
     ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY ${scope.accountId ? "date DESC, id DESC" : "date DESC, sms_id DESC"}
     LIMIT ?`;
  const candidateRows = await client.getAllAsync<{ smsId: string; date: number }>(
    stage1Sql,
    stage1Params,
  );

  const smsIds: string[] = [];
  const seen = new Set<string>();
  for (const row of candidateRows) {
    if (seen.has(row.smsId)) continue;
    seen.add(row.smsId);
    smsIds.push(row.smsId);
    if (smsIds.length === limit) break;
  }
  if (smsIds.length === 0) return [];

  const placeholders = smsIds.map(() => "?").join(", ");
  const recencyThreshold = at.getTime() - RECENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  // Stage 2: aggregate ALL activity rows for exactly those smsIds. Picks
  // one canonical row per smsId for the row-presentation fields (they're
  // identical across every (smsId, category) row for the same smsId — see
  // schema.ts's own comment on activity's row-presentation columns) via
  // MIN(...) per field, which is deterministic and cheap; categories[] via
  // json_group_array; the lexicographically-smallest matching category via
  // MIN(category), for HomeActivityDetailTarget's non-financial fallback;
  // and isRecurring/transactionId via a left join to transactions (only
  // meaningful when a transactions row exists at all). isRecurring's
  // subscription half mirrors isInferredRecurringTransaction exactly: same
  // subscriptionIdentityKey (currency-scoped merchant match), non-expired
  // (last_date >= recencyThreshold, the same window dashboard.ts's own
  // subscriptions derivation applies), AND the transaction's own amount
  // within AMOUNT_TOLERANCE_RATIO of the subscription's amount — comparing
  // minor-unit integers on both sides is equivalent to comparing the
  // subscriptions.ts's display-unit ratio directly, since both numerator and
  // denominator share the same per-currency minor-unit scale factor, which
  // cancels out of the ratio.
  const rows = await client.getAllAsync<ActivityGroupedRow>(
    `SELECT a.sms_id AS smsId,
            MAX(a.date) AS date,
            json_group_array(a.category) AS categories,
            MIN(a.bank_name) AS bankName,
            MIN(a.brand_name) AS brandName,
            MIN(a.vendor) AS vendor,
            MIN(a.bene) AS bene,
            MIN(a.merchant_category) AS merchantCategory,
            MIN(a.sender) AS sender,
            MIN(a.trx_type_rich) AS trxTypeRich,
            MIN(a.subcategory) AS subcategory,
            MIN(a.mandate_event) AS mandateEvent,
            MIN(a.is_from_card) AS isFromCard,
            MIN(a.amount_minor_units) AS amountMinorUnits,
            MIN(a.currency) AS currency,
            MIN(a.direction) AS direction,
            MIN(a.category) AS minCategory,
            MIN(a.account_id) AS accountId,
            t.id AS transactionId,
            (t.id IS NOT NULL AND (
              (t.mandate_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM mandates m WHERE m.mandate_id = t.mandate_id
              ))
              OR
              (t.subscription_identity_key IS NOT NULL AND EXISTS (
                SELECT 1 FROM subscriptions s
                WHERE s.id = t.subscription_identity_key
                  AND s.last_date >= ?
                  AND ABS(s.amount_minor_units - t.amount_minor_units)
                      <= MAX(s.amount_minor_units, t.amount_minor_units, 1) * ?
              ))
            )) AS isRecurring
     FROM activity a
     LEFT JOIN transactions t ON t.sms_id = a.sms_id
     WHERE a.sms_id IN (${placeholders})
     GROUP BY a.sms_id
     ORDER BY date DESC, a.sms_id DESC`,
    [recencyThreshold, AMOUNT_TOLERANCE_RATIO, ...smsIds],
  );

  return rows.map((row) => {
    const categories = JSON.parse(row.categories) as string[] as ActivityCategory[];
    const detailTarget: HomeActivityDetailTarget = row.transactionId
      ? { kind: "transaction", id: row.transactionId }
      : { kind: "activity", id: `${row.smsId}|${row.minCategory}` };
    return {
      smsId: row.smsId,
      date: row.date,
      categories,
      detailTarget,
      accountId: row.accountId,
      bankName: row.bankName,
      brandName: row.brandName,
      vendor: row.vendor,
      bene: row.bene,
      merchantCategory: row.merchantCategory,
      sender: row.sender,
      trxTypeRich: row.trxTypeRich,
      subcategory: row.subcategory,
      mandateEvent: row.mandateEvent,
      isFromCard: row.isFromCard === 1,
      amountMinorUnits: row.amountMinorUnits,
      currency: row.currency,
      direction: row.direction,
      isRecurring: row.isRecurring === 1,
    };
  });
}

export async function queryHomeRecentActivity(
  query: HomeRecentActivityQuery,
  client: AsyncQueryClient = defaultClient(),
): Promise<HomeActivityItem[]> {
  // A period-scoped read (one month on the Transactions tab) is bounded by
  // its period, so it may return the whole period — the recent-feed cap of
  // 100 silently truncated busy months and left older months incomplete.
  const periodScoped = query.from !== undefined && query.to !== undefined;
  const limit = validatedPositiveInt(
    query.limit ?? HOME_LOAD_RECENT_ACTIVITY_DEFAULT_LIMIT,
    periodScoped ? HOME_ACTIVITY_PERIOD_MAX_LIMIT : HOME_RECENT_ACTIVITY_MAX_LIMIT,
    "Home recent activity limit",
  );
  const at = query.at !== undefined ? new Date(query.at) : new Date();
  return queryHomeActivityRows(
    client,
    {
      category: query.category,
      accountId: query.accountId,
      from: query.from,
      to: query.to,
      transactionsOnly: query.transactionsOnly,
    },
    limit,
    at,
  );
}

export async function queryHomeActivityCategoryCounts(
  client: AsyncQueryClient = defaultClient(),
  accountId?: string,
): Promise<HomeActivityCategoryCount[]> {
  const rows = await client.getAllAsync<{ category: ActivityCategory; count: number }>(
    accountId
      ? `SELECT category, COUNT(DISTINCT sms_id) AS count
         FROM activity
         WHERE account_id = ?
         GROUP BY category`
      : `SELECT category, COUNT(DISTINCT sms_id) AS count
         FROM activity
         GROUP BY category`,
    accountId ? [accountId] : [],
  );
  return rows;
}

export async function queryHomeTotalActivityCount(
  client: AsyncQueryClient = defaultClient(),
  accountId?: string,
): Promise<number> {
  const rows = await client.getAllAsync<{ count: number }>(
    accountId
      ? `SELECT COUNT(DISTINCT sms_id) AS count FROM activity WHERE account_id = ?`
      : `SELECT COUNT(DISTINCT sms_id) AS count FROM activity`,
    accountId ? [accountId] : [],
  );
  return rows[0]?.count ?? 0;
}

export async function queryHomeAccountCategoryTotals(
  currency: string,
  at: Date,
  accountId: string,
  client: AsyncQueryClient = defaultClient(),
): Promise<CategoryTotal[]> {
  const monthStart = new Date(at.getFullYear(), at.getMonth(), 1).getTime();
  const monthEnd = new Date(at.getFullYear(), at.getMonth() + 1, 1).getTime();
  const rows = await client.getAllAsync<{ category: string; totalMinorUnits: number }>(
    `SELECT category, SUM(amount_minor_units) AS totalMinorUnits
     FROM transactions
     WHERE currency = ? AND account_id = ? AND date >= ? AND date < ?
       AND direction = 'expense'
     GROUP BY category
     ORDER BY totalMinorUnits DESC`,
    [currency, accountId, monthStart, monthEnd],
  );
  return rows;
}

export async function queryHomeAccountMonthTotals(
  currency: string,
  at: Date,
  accountId: string,
  client: AsyncQueryClient = defaultClient(),
): Promise<{ incomeMinorUnits: number; expenseMinorUnits: number }> {
  const monthStart = new Date(at.getFullYear(), at.getMonth(), 1).getTime();
  const monthEnd = new Date(at.getFullYear(), at.getMonth() + 1, 1).getTime();
  const rows = await client.getAllAsync<{
    incomeMinorUnits: number;
    expenseMinorUnits: number;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN direction = 'income' THEN amount_minor_units ELSE 0 END), 0)
         AS incomeMinorUnits,
       COALESCE(SUM(CASE WHEN direction = 'expense' THEN amount_minor_units ELSE 0 END), 0)
         AS expenseMinorUnits
     FROM transactions
     WHERE currency = ? AND account_id = ? AND date >= ? AND date < ?
       AND direction IN ('income', 'expense')`,
    [currency, accountId, monthStart, monthEnd],
  );
  return rows[0] ?? { incomeMinorUnits: 0, expenseMinorUnits: 0 };
}

// ── load() composition ───────────────────────────────────────────────────

async function loadHomeReadModelUnsafe(
  query: HomeReadModelQuery,
  client: AsyncQueryClient,
): Promise<HomeReadModel> {
  const at = new Date(query.at);

  // queryDetectedAccountsUnsafe (db/queries-accounts.ts) — the one shared,
  // freshness-ungated core both the standalone accounts.listDetected() and
  // this composed snapshot read use, so detected-account selection has
  // exactly one owner instead of two independently-maintained copies. Using
  // the standalone (freshness-gated) queryDetectedAccounts() here instead
  // would have silently escaped the single injected `client` this whole
  // snapshot is built around, and re-opened a second freshness check
  // partway through a multi-query read — exactly the race
  // readConsistentSnapshot()'s own before/after revision check exists to
  // catch.
  const [accounts, detectedAccountsRows, unassignedReadings, allCurrencies] = await Promise.all([
    queryHomeAccounts(client),
    queryDetectedAccountsUnsafe(client),
    queryHomeUnassignedReadings(client),
    queryDistinctCurrencies(client),
  ]);

  const aggregates = await queryDashboardAggregates(allCurrencies, at, client);

  const [
    flowDays,
    calendarMonths,
    subscriptionOverview,
    recentActivity,
    activityCategoryCounts,
    totalActivityCount,
  ] = await Promise.all([
    queryHomeFlowDays(query.currency, at, client),
    queryHomeCalendarMonths({ currency: query.currency, at: query.at }, client),
    queryHomeSubscriptionOverview(at, client),
    queryHomeActivityRows(client, {}, HOME_RECENT_ACTIVITY_DEFAULT_LIMIT, at),
    queryHomeActivityCategoryCounts(client),
    queryHomeTotalActivityCount(client),
  ]);

  return {
    currency: query.currency,
    accounts,
    detectedAccounts: detectedAccountsRows,
    unassignedReadings,
    monthTotals: aggregates.monthTotals,
    categoryTotalsByCurrency: aggregates.categoryTotalsByCurrency,
    availableCurrencies: allCurrencies,
    flowDays,
    calendarMonths,
    subscriptionOverview,
    recentActivity,
    activityCategoryCounts,
    totalActivityCount,
  };
}

// The concrete HomeDataSource implementation. load() composes many
// separately-issued queries, so it must run inside readConsistentSnapshot()
// (revision-checked before and after every one of them) — see
// HomeDataSource's own top comment in lib/dashboard-data.ts.
// The auxiliary methods also compose multiple statements internally, so
// they use the same snapshot retry primitive rather than only a freshness
// gate that could allow a publish between their statements.
export const homeDataSource: HomeDataSource = {
  load: (query) => readConsistentSnapshot(() => loadHomeReadModelUnsafe(query, defaultClient())),
  loadHighlights: queryHomeHighlights,
  loadCalendarMonths: (query) =>
    readConsistentSnapshot(() => queryHomeCalendarMonths(query, defaultClient())),
  loadRecentActivity: (query) =>
    readConsistentSnapshot(() => queryHomeRecentActivity(query, defaultClient())),
  loadActivityScope: (query) =>
    readConsistentSnapshot(async () => {
      const client = defaultClient();
      const [categoryCounts, totalActivityCount] = await Promise.all([
        queryHomeActivityCategoryCounts(client, query.accountId),
        queryHomeTotalActivityCount(client, query.accountId),
      ]);
      return { categoryCounts, totalActivityCount };
    }),
  loadAccountCashflowScope: (query) =>
    readConsistentSnapshot(async () => {
      const client = defaultClient();
      const at = new Date(query.at);
      const [flowDays, monthTotals, categoryTotals, calendarMonths] = await Promise.all([
        queryHomeFlowDays(query.currency, at, client, query.accountId),
        queryHomeAccountMonthTotals(query.currency, at, query.accountId, client),
        queryHomeAccountCategoryTotals(query.currency, at, query.accountId, client),
        queryHomeCalendarMonths(
          { currency: query.currency, at: query.at, accountId: query.accountId },
          client,
        ),
      ]);
      return { flowDays, ...monthTotals, categoryTotals, calendarMonths };
    }),
};
