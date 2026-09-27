// Account-family read queries against the normalized projection tables
// (accounts, detected_accounts, balance_readings — see db/schema.ts /
// db/projections.ts). Built with drizzle-orm's query builder — these need
// typed keyset predicates (and(), or(), lt()) that are awkward to hand-write
// — but executed through expo-sqlite's async API on the same already-keyed
// connection (db/async-select.ts), so a screen read never blocks the JS
// thread. queryDetectedAccountsUnsafe is raw async SQL — see its own comment.
import { and, asc, desc, eq, isNull, lt, or, type SQL } from "drizzle-orm";
import { normalizeBankName } from "../lib/dashboard";
import type {
  AccountScopeCounts,
  AccountSummary,
  BalanceHistoryQuery,
  BalanceReadingCursor,
  BalanceReadingPage,
  BalanceReadingSummary,
  DetectedAccountSummary,
  UnassignedReadingsQuery,
} from "../lib/dashboard-data";
import { aliasedColumns, selectAsync } from "./async-select";
import { db, sqlite } from "./client";
import { ensureProjectionReadable } from "./ingestion";
import { accounts, balanceReadings } from "./schema";
import type { Database } from "./client.native";
import type { AsyncQueryClient } from "./queries";

function requireDb(): Database {
  if (!db) {
    throw new Error(
      "Local database is not available on this platform (see db/client.web.ts) — " +
        "these queries are Android-only, same as the rest of apps/native/db.",
    );
  }
  return db;
}

function requireSqlite(): AsyncQueryClient {
  if (!sqlite) {
    throw new Error(
      "Local database is not available on this platform (see db/client.web.ts) — " +
        "these queries are Android-only, same as the rest of apps/native/db.",
    );
  }
  return sqlite;
}

const BALANCE_HISTORY_DEFAULT_LIMIT = 30;
const BALANCE_HISTORY_MAX_LIMIT = 100;

function validatedLimit(limit: number | undefined): number {
  const resolved = limit ?? BALANCE_HISTORY_DEFAULT_LIMIT;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > BALANCE_HISTORY_MAX_LIMIT) {
    throw new Error(
      `Balance history limit must be an integer from 1 to ${BALANCE_HISTORY_MAX_LIMIT}, got ${resolved}`,
    );
  }
  return resolved;
}

// Every confirmed account a real device holds is a small, human-bounded set
// (a handful of bank accounts, never thousands) — unlike balance history or
// transactions, which grow with every SMS. See dashboard-data.ts's
// AccountSummary/accounts.list comment for why this stays unpaginated
// while balance history below does not.
export async function queryAccounts(): Promise<AccountSummary[]> {
  const database = requireDb();
  await ensureProjectionReadable();
  // balanceMinorUnits/estimatedBalanceMinorUnits are genuine SQL NULL for
  // an unreported account (schema.ts's accounts_anchor_status_balance_
  // nullability_check enforces this at write time) — no JS-side
  // reported/unreported branching needed here; a 0 read back from either
  // column is always a real reported zero balance.
  return selectAsync<AccountSummary>(
    database
      .select(
        aliasedColumns({
          id: accounts.id,
          bankName: accounts.bankName,
          last4: accounts.last4,
          currency: accounts.currency,
          anchorStatus: accounts.anchorStatus,
          balanceMinorUnits: accounts.balanceMinorUnits,
          balanceAsOf: accounts.balanceAsOf,
          balanceSender: accounts.balanceSender,
          estimatedBalanceMinorUnits: accounts.estimatedBalanceMinorUnits,
          estimatedAsOf: accounts.estimatedAsOf,
          reconciliationDeltaMinorUnits: accounts.reconciliationDeltaMinorUnits,
          capturedIncomeMinorUnits: accounts.capturedIncomeMinorUnits,
          capturedExpenseMinorUnits: accounts.capturedExpenseMinorUnits,
          capturedChangeMinorUnits: accounts.capturedChangeMinorUnits,
          capturedTransactionCount: accounts.capturedTransactionCount,
        }),
      )
      .from(accounts)
      .orderBy(desc(accounts.balanceAsOf), asc(accounts.id)),
  );
}

// Async raw SQL (db/queries.ts's AsyncQueryClient pattern), not sync
// drizzle like the rest of this file — this is the one query in this
// module that db/queries-home.ts's HomeReadModel.load() also needs, and
// that composed read already runs every other query through a single
// injected AsyncQueryClient inside readConsistentSnapshot(); a version
// built on the sync `db` connection would have no client to inject there,
// so Home's read would either open a second, ungated connection outside
// the snapshot (the bug this consolidation fixes) or this file would need
// to expose two incompatible query styles. Ungated by design (no
// ensureDashboardProjectionCurrent call) — freshness is the caller's
// responsibility, exactly like every other queryHome* function in
// db/queries-home.ts: queryDetectedAccounts below gates it once for a
// standalone call, and Home's readConsistentSnapshot() gates it once per
// snapshot attempt; neither wants a second, redundant check buried inside
// this function.
export async function queryDetectedAccountsUnsafe(
  client: AsyncQueryClient,
): Promise<DetectedAccountSummary[]> {
  return client.getAllAsync<DetectedAccountSummary>(
    `SELECT id, bank_name AS bankName, last4, currency, as_of AS asOf, sender
     FROM detected_accounts
     ORDER BY as_of DESC, id ASC`,
    [],
  );
}

export async function queryDetectedAccounts(): Promise<DetectedAccountSummary[]> {
  await ensureProjectionReadable();
  return queryDetectedAccountsUnsafe(requireSqlite());
}

const balanceReadingColumns = {
  id: balanceReadings.id,
  accountId: balanceReadings.accountId,
  balanceMinorUnits: balanceReadings.balanceMinorUnits,
  currency: balanceReadings.currency,
  asOf: balanceReadings.asOf,
  detectedBankName: balanceReadings.detectedBankName,
  detectedAccount: balanceReadings.detectedAccount,
  associationKind: balanceReadings.associationKind,
  sender: balanceReadings.sender,
  reconciliationPreviousAsOf: balanceReadings.reconciliationPreviousAsOf,
  reconciliationExpectedBalanceMinorUnits: balanceReadings.reconciliationExpectedBalanceMinorUnits,
  reconciliationDeltaMinorUnits: balanceReadings.reconciliationDeltaMinorUnits,
  capturedIncomeMinorUnits: balanceReadings.capturedIncomeMinorUnits,
  capturedExpenseMinorUnits: balanceReadings.capturedExpenseMinorUnits,
  capturedTransactionCount: balanceReadings.capturedTransactionCount,
} as const;

function cursorCondition(cursor: BalanceReadingCursor | undefined): SQL | undefined {
  if (!cursor) return undefined;
  return or(
    lt(balanceReadings.asOf, cursor.asOf),
    and(eq(balanceReadings.asOf, cursor.asOf), lt(balanceReadings.id, cursor.id)),
  );
}

function toPage(rows: BalanceReadingSummary[], limit: number): BalanceReadingPage {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last ? { asOf: last.asOf, id: last.id } : null,
  };
}

// Newest-first, keyset-paginated by (asOf DESC, id DESC) — id is the
// tiebreaker for readings sharing the exact same asOf timestamp, the same
// pattern db/ingestion.ts's queryTransactionPage uses for `date`.
export async function queryBalanceHistory(query: BalanceHistoryQuery): Promise<BalanceReadingPage> {
  const limit = validatedLimit(query.limit);
  const database = requireDb();
  await ensureProjectionReadable();

  const conditions = [eq(balanceReadings.accountId, query.accountId)];
  const cursor = cursorCondition(query.cursor);
  if (cursor) conditions.push(cursor);

  const rows = await selectAsync<BalanceReadingSummary>(
    database
      .select(aliasedColumns(balanceReadingColumns))
      .from(balanceReadings)
      .where(and(...conditions))
      .orderBy(desc(balanceReadings.asOf), desc(balanceReadings.id))
      .limit(limit + 1),
  );

  return toPage(rows, limit);
}

// Readings with no confirmed account (associationKind 'unassigned' or
// 'suggested' — see schema.ts's balance_readings.account_id comment) can
// never be scoped by accountId, so this scopes by the canonical
// detectedBankKey instead (never the raw detectedBankName — two readings
// for the same real bank can carry different casing/whitespace, and
// filtering on the raw name would silently return an incomplete or empty
// result) and excludes any reading that did get attached to a confirmed
// account.
export async function queryUnassignedReadings(
  query: UnassignedReadingsQuery,
): Promise<BalanceReadingPage> {
  const limit = validatedLimit(query.limit);
  const database = requireDb();
  await ensureProjectionReadable();

  const conditions = [
    eq(balanceReadings.detectedBankKey, normalizeBankName(query.bankName)),
    isNull(balanceReadings.accountId),
  ];
  const cursor = cursorCondition(query.cursor);
  if (cursor) conditions.push(cursor);

  const rows = await selectAsync<BalanceReadingSummary>(
    database
      .select(aliasedColumns(balanceReadingColumns))
      .from(balanceReadings)
      .where(and(...conditions))
      .orderBy(desc(balanceReadings.asOf), desc(balanceReadings.id))
      .limit(limit + 1),
  );

  return toPage(rows, limit);
}

// One revision-consistent read for profile/settings summaries — both counts
// come from the same SQLite statement after projection freshness is checked.
export async function queryAccountScopeCounts(): Promise<AccountScopeCounts> {
  await ensureProjectionReadable();
  const rows = await requireSqlite().getAllAsync<AccountScopeCounts>(
    `SELECT
      (SELECT COUNT(*) FROM accounts) AS confirmedCount,
      (SELECT COUNT(*) FROM detected_accounts) AS detectedCount`,
    [],
  );
  const row = rows[0];
  return {
    confirmedCount: row?.confirmedCount ?? 0,
    detectedCount: row?.detectedCount ?? 0,
  };
}
