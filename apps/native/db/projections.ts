// Persists a freshly-derived Dashboard as normalized rows (accounts,
// detected_accounts, balance_readings, transactions, activity,
// subscriptions, mandates, mandate_events) —
// the "SQLite normalized projections" layer. This module never
// re-derives reconciliation/account-attribution/dedup logic itself: it
// only writes down what lib/dashboard.ts's deriveDashboard() already
// computed. Bulk operations publish once after their complete drain;
// standalone ingestion can publish immediately. sms_ledger remains the
// sole source of truth — these
// tables are a rebuildable cache of it, not a second independent write
// path, and are always fully replaced from a fresh Dashboard rather than
// incrementally patched, so they can never drift from what
// deriveDashboard() would compute from the ledger right now.
import { eq, inArray } from "drizzle-orm";
import type { BaseSQLiteDatabase, SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { isProductActivityCategory } from "../lib/activity-filters";
import {
  resolveActivityAccountId,
  toActivityAccountAttributionCandidate,
} from "../lib/activity-account-attribution";
import {
  createTransactionAccountResolver,
  normalizeBankName,
  type AccountBalance,
  type BalanceReading,
  type DashboardProjection,
  type DetectedAccount,
  type Mandate,
} from "../lib/dashboard";
import type { ParsedSms } from "../lib/sms";
import { subscriptionIdentityKey, type Subscription } from "../lib/subscriptions";
import { trxDirection } from "../lib/transaction-direction";
import { transactionCategoryLabel } from "../lib/transaction-category";
import { minorUnitExponent, toMinorUnits } from "../lib/currency";
import {
  accounts,
  activity,
  balanceReadings,
  DASHBOARD_PROJECTION_ID,
  detectedAccounts,
  mandateEvents,
  messageFacts,
  mandates,
  projectionState,
  subscriptions,
  transactions,
} from "./schema";
import { notifyDataChanged } from "./data-changes";
import type * as schema from "./schema";

// Typed against drizzle's own sync-SQLite base class, parameterized by
// this app's real schema, rather than db/client.native.ts's Expo-specific
// Database alias — that alias's run-result shape (SQLiteRunResult, with
// lastInsertRowId) is Expo-driver-specific and this module never reads a
// run result at all, so requiring it would only block testing this
// module against a plain better-sqlite3 connection (as
// projections.test.ts does) for no real benefit in production, where the
// Expo-backed db already satisfies this same structural type.
type SyncSqliteDatabase = BaseSQLiteDatabase<"sync", unknown, typeof schema>;

// Keeps every multi-row INSERT comfortably below Android SQLite's bind
// variable limit even for the widest projection table, while avoiding one
// JS-to-native statement per row on large histories.
const PROJECTION_INSERT_BATCH_SIZE = 25;

function batches<T>(rows: readonly T[]): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < rows.length; index += PROJECTION_INSERT_BATCH_SIZE) {
    result.push(rows.slice(index, index + PROJECTION_INSERT_BATCH_SIZE));
  }
  return result;
}

function accountRowId(bankName: string, last4: string): string {
  return `${bankName.trim().replace(/\s+/g, " ").toLowerCase()}|${last4}`;
}

// Money fields on Dashboard/AccountBalance/BalanceReading are already
// plain JS numbers (deriveDashboard parses them via parseFloat), not the
// original parser strings — toFixed(exponent), scoped to the currency's
// own real minor-unit precision, round-trips them back through
// toMinorUnits's own string-based (never floating-point) parser, rather
// than doing float arithmetic directly, which is exactly the imprecision
// toMinorUnits exists to avoid. This is safe specifically because these
// numbers originated from toMinorUnits-safe strings in the first place —
// rounding to the currency's own exponent here can't lose any precision
// toMinorUnits would have accepted from the original string.
function numberToMinorUnits(amount: number, currencyCode: string): number {
  return toMinorUnits(amount.toFixed(minorUnitExponent(currencyCode)), currencyCode);
}

function projectBalanceReading(
  reading: BalanceReading,
  accountId: string | null,
): typeof balanceReadings.$inferInsert {
  const reconciliation = reading.reconciliation;
  return {
    // One reading per originating SMS — see schema.ts's own comment on
    // balanceReadings.id.
    id: reading.smsId,
    smsId: reading.smsId,
    accountId,
    balanceMinorUnits: numberToMinorUnits(reading.balance, reading.currency),
    currency: reading.currency,
    asOf: reading.asOf,
    detectedBankName: reading.detectedBankName,
    detectedBankKey: normalizeBankName(reading.detectedBankName),
    detectedAccount: reading.detectedAccount,
    associationKind: reading.association.kind,
    sender: reading.sender,
    reconciliationPreviousAsOf: reconciliation?.previousAsOf ?? null,
    reconciliationExpectedBalanceMinorUnits:
      reconciliation !== null
        ? numberToMinorUnits(reconciliation.expectedBalance, reading.currency)
        : null,
    reconciliationDeltaMinorUnits:
      reconciliation !== null ? numberToMinorUnits(reconciliation.delta, reading.currency) : null,
    capturedIncomeMinorUnits:
      reconciliation !== null
        ? numberToMinorUnits(reconciliation.capturedIncome, reading.currency)
        : null,
    capturedExpenseMinorUnits:
      reconciliation !== null
        ? numberToMinorUnits(reconciliation.capturedExpense, reading.currency)
        : null,
    capturedTransactionCount: reconciliation?.capturedTransactionCount ?? null,
  };
}

function projectAccount(account: AccountBalance): typeof accounts.$inferInsert {
  return {
    id: accountRowId(account.bankName, account.last4),
    bankName: account.bankName,
    bankKey: normalizeBankName(account.bankName),
    last4: account.last4,
    currency: account.currency,
    anchorStatus: account.anchorStatus,
    balanceMinorUnits:
      account.anchorStatus === "reported"
        ? numberToMinorUnits(account.balance, account.currency)
        : null,
    balanceAsOf: account.asOf,
    balanceSender: account.sender,
    estimatedBalanceMinorUnits:
      account.anchorStatus === "reported"
        ? numberToMinorUnits(account.estimatedBalance, account.currency)
        : null,
    estimatedAsOf: account.estimatedAsOf,
    reconciliationDeltaMinorUnits:
      account.reconciliationDelta !== null
        ? numberToMinorUnits(account.reconciliationDelta, account.currency)
        : null,
    capturedIncomeMinorUnits: numberToMinorUnits(account.capturedIncome, account.currency),
    capturedExpenseMinorUnits: numberToMinorUnits(account.capturedExpense, account.currency),
    capturedChangeMinorUnits: numberToMinorUnits(account.capturedChange, account.currency),
    capturedTransactionCount: account.capturedTransactionCount,
  };
}

function projectDetectedAccount(account: DetectedAccount): typeof detectedAccounts.$inferInsert {
  return {
    id: accountRowId(account.bankName, account.last4),
    bankName: account.bankName,
    last4: account.last4,
    currency: account.currency,
    asOf: account.asOf,
    sender: account.sender,
  };
}

function projectTransaction(
  message: ParsedSms,
  accountId: string | null,
): typeof transactions.$inferInsert | null {
  const { result } = message;
  const amountRaw = result.trx;
  if (!amountRaw || !result.trxTypeRich) return null;
  const currency = result.currency ?? "INR";
  let amountMinorUnits: number;
  try {
    amountMinorUnits = toMinorUnits(amountRaw, currency);
  } catch {
    // A transaction the parser flagged with an amount string this
    // currency's minor-unit rules can't represent (malformed grouping,
    // too much precision) is skipped from the projection rather than
    // thrown — sms_ledger still has the raw message; this table is a
    // best-effort cache of it, and one bad row must not abort every
    // other transaction in the same ingested batch.
    return null;
  }

  const direction = trxDirection(result.trxTypeRich);
  // Mirrors lib/subscriptions.ts's isInferredRecurringTransaction exactly:
  // brandName first, vendor as fallback — never bankName or any other
  // field. subscriptionIdentityKey is the single owner of the
  // normalizeMerchant+currency composite format — the same function
  // subscriptions.id and allQualifyingSubscriptions's own candidate
  // grouping both call, so there is exactly one place this format is
  // defined, not three independently-maintained copies of the same string
  // template.
  const merchant = result.brandName ?? result.vendor ?? null;

  return {
    id: message.id,
    smsId: message.id,
    accountId,
    amountMinorUnits,
    currency,
    direction,
    trxTypeRich: result.trxTypeRich,
    vendor: result.vendor ?? null,
    brandName: result.brandName ?? null,
    merchantCategory: result.merchantCategory ?? null,
    subcategory: result.subcategory ?? null,
    category: transactionCategoryLabel(result.merchantCategory, result.subcategory),
    ref: result.ref ?? null,
    bankName: result.bankName ?? null,
    date: message.date,
    mandateId: result.mandateId ?? null,
    subscriptionIdentityKey: subscriptionIdentityKey(merchant, currency),
  };
}

// `financialRow` is the already-computed projectTransaction result for this
// same message when one exists — reused rather than re-derived, so
// activity rows can't silently disagree with the transactions row for the
// same message. A non-financial activity message (travel/delivery/OTP/
// offers with no trx amount) has no financialRow, and its
// amount/currency/direction stay null — this table was never meant to
// invent a transaction that doesn't exist.
function projectActivityRows(
  message: ParsedSms,
  financialRow: typeof transactions.$inferInsert | null,
  accountCandidates: ReturnType<typeof toActivityAccountAttributionCandidate>[],
): (typeof activity.$inferInsert)[] {
  const { result } = message;
  const categories = (result.matchedCategories ?? []).filter(isProductActivityCategory);
  const accountId = resolveActivityAccountId(
    result.bankName ?? null,
    result.acc ?? null,
    financialRow?.currency ?? result.currency ?? null,
    accountCandidates,
  );
  return categories.map((category) => ({
    id: `${message.id}|${category}`,
    smsId: message.id,
    category,
    date: message.date,
    accountId,
    bankName: result.bankName ?? null,
    brandName: result.brandName ?? null,
    vendor: result.vendor ?? null,
    trxTypeRich: result.trxTypeRich ?? null,
    subcategory: result.subcategory ?? null,
    mandateEvent: result.mandateEvent ?? null,
    isFromCard: result.isFromCard,
    amountMinorUnits: financialRow?.amountMinorUnits ?? null,
    currency: financialRow?.currency ?? null,
    direction: financialRow?.direction ?? null,
    bene: result.bene ?? null,
    merchantCategory: result.merchantCategory ?? null,
    sender: message.sender,
  }));
}

function projectSubscription(subscription: Subscription): typeof subscriptions.$inferInsert {
  // subscription.merchant/currency always produce a non-null key here —
  // allQualifyingSubscriptions only ever creates a Subscription for a
  // candidate that already passed subscriptionIdentityKey's own
  // non-empty-normalization guard when it was grouped (see subscriptions.ts's
  // own key/candidates.set call) — but the shared helper's return type is
  // still `string | null`, so this is asserted, not silently cast, to keep
  // that guarantee visible at the one call site where it could ever be
  // violated by a future change to either function.
  const id = subscriptionIdentityKey(subscription.merchant, subscription.currency);
  if (!id) {
    throw new Error(
      `Unreachable: allQualifyingSubscriptions produced a Subscription with no usable identity key (merchant=${JSON.stringify(subscription.merchant)}, currency=${subscription.currency})`,
    );
  }
  return {
    id,
    merchant: subscription.merchant,
    amountMinorUnits: numberToMinorUnits(subscription.amount, subscription.currency),
    currency: subscription.currency,
    count: subscription.count,
    lastDate: subscription.lastDate,
    confidence: subscription.confidence,
  };
}

function projectMandate(mandate: Mandate): typeof mandates.$inferInsert {
  return {
    mandateId: mandate.mandateId,
    merchant: mandate.merchant,
    amountMinorUnits:
      mandate.amount !== null ? numberToMinorUnits(mandate.amount, mandate.currency) : null,
    currency: mandate.currency,
    status: mandate.status,
    createdAt: mandate.createdAt,
    lastUpdated: mandate.lastUpdated,
    sender: mandate.sender,
  };
}

// Makes the normalized tables hold exactly what the given Dashboard
// (already derived from the full, current sms_ledger — see
// ingestion.ts's ingestSmsBatch) says should exist. The projection is
// always derived whole — never incrementally re-derived: deriveDashboard's
// own attribution (which account a transaction belongs to, which readings
// survive dedup, mandate status as of the latest message) can change an
// already-projected row's foreign key or field values, and re-deriving
// incrementally would mean reimplementing that logic a second time. Only
// the WRITE is incremental: rows identical to the last publish are left
// alone (see "Publishing" below). Runs inside one transaction so a reader
// never observes a half-replaced projection.
//
// Takes the whole DashboardProjection — dashboard and allSubscriptions
// always come from one deriveDashboardProjection() call and are projected
// together, so callers pass that single result through rather than pulling
// it apart into positional arguments. allSubscriptions is the
// persistence-only, recency-unfiltered set (Dashboard itself deliberately
// doesn't carry it — see lib/dashboard.ts's DashboardProjection).
export function replaceProjection(
  database: SyncSqliteDatabase,
  projection: DashboardProjection,
  afterReplace?: (transaction: SyncSqliteDatabase) => void,
): void {
  const { dashboard, allSubscriptions, messageFacts: facts } = projection;
  const accountRows = dashboard.accounts.map(projectAccount);
  const detectedAccountRows = dashboard.detectedAccounts.map(projectDetectedAccount);

  const balanceReadingRows: (typeof balanceReadings.$inferInsert)[] = [];
  for (const account of dashboard.accounts) {
    const accountId = accountRowId(account.bankName, account.last4);
    for (const reading of account.history) {
      balanceReadingRows.push(projectBalanceReading(reading, accountId));
    }
  }
  for (const bank of dashboard.banks) {
    for (const reading of bank.unassignedReadings) {
      balanceReadingRows.push(projectBalanceReading(reading, null));
    }
  }

  const transactionRows: (typeof transactions.$inferInsert)[] = [];
  const transactionRowsBySmsId = new Map<string, typeof transactions.$inferInsert>();
  const resolveTransactionAccountId = createTransactionAccountResolver(dashboard.accounts);
  for (const message of dashboard.recent) {
    // Reuse dashboard.ts's exact association policy, including account
    // digits, currency, bank-name evidence and multi-account ambiguity.
    const row = projectTransaction(message, resolveTransactionAccountId(message));
    if (row) {
      transactionRows.push(row);
      transactionRowsBySmsId.set(message.id, row);
    }
  }

  const activityAccountCandidates = dashboard.accounts.map((account) =>
    toActivityAccountAttributionCandidate(
      account,
      accountRowId(account.bankName, account.last4),
    ),
  );
  const activityRows = dashboard.activity.flatMap((message) =>
    projectActivityRows(
      message,
      transactionRowsBySmsId.get(message.id) ?? null,
      activityAccountCandidates,
    ),
  );
  // The passed-in allSubscriptions parameter, not dashboard.subscriptions
  // (which is recency-filtered) — persisting the filtered view means an
  // unrelated ingest run happening after a subscription ages past its
  // recency window permanently deletes the row before any reader's own
  // clock (db/queries.ts's querySubscriptions) gets a say.
  const subscriptionRows = allSubscriptions.map(projectSubscription);
  const mandateRows = dashboard.mandates.map(projectMandate);
  const mandateEventRows: (typeof mandateEvents.$inferInsert)[] = dashboard.mandates.flatMap(
    (mandate) =>
      mandate.history.map((event) => ({
        id: event.smsId,
        smsId: event.smsId,
        mandateId: mandate.mandateId,
        status: event.status,
        date: event.date,
        sender: event.sender,
      })),
  );

  const messageFactRows: (typeof messageFacts.$inferInsert)[] = facts.map((fact) => ({
    id: fact.id,
    date: fact.date,
    sender: fact.sender,
    currency: fact.currency,
    payload: JSON.stringify(fact.fields),
  }));

  // Parents (referenced by FKs) and children, each with its primary key.
  const parents: TableRows[] = [
    tableRows("accounts", accounts, accounts.id, accountRows, (row) => row.id),
    tableRows("detectedAccounts", detectedAccounts, detectedAccounts.id, detectedAccountRows, (row) => row.id),
    tableRows("mandates", mandates, mandates.mandateId, mandateRows, (row) => row.mandateId),
  ];
  const children: TableRows[] = [
    tableRows("balanceReadings", balanceReadings, balanceReadings.id, balanceReadingRows, (row) => row.id),
    tableRows("transactions", transactions, transactions.id, transactionRows, (row) => row.id),
    tableRows("activity", activity, activity.id, activityRows, (row) => row.id),
    tableRows("subscriptions", subscriptions, subscriptions.id, subscriptionRows, (row) => row.id),
    tableRows("mandateEvents", mandateEvents, mandateEvents.id, mandateEventRows, (row) => row.id),
    tableRows("messageFacts", messageFacts, messageFacts.id, messageFactRows, (row) => row.id),
  ];

  let nextBaseline: PublishedBaseline | undefined;
  database.transaction((tx) => {
    const baseline = publishedBaselines.get(database);
    const diffable =
      afterReplace !== undefined &&
      baseline !== undefined &&
      readProjectedRevision(tx) === baseline.revision;
    if (diffable) writeChangedRows(tx, parents, children, baseline);
    else writeAllRows(tx, parents, children);
    afterReplace?.(tx);
    // Only a guarded publish (afterReplace advances projected_revision)
    // leaves a baseline a later publish may diff against.
    if (afterReplace) {
      nextBaseline = {
        revision: readProjectedRevision(tx),
        tables: new Map([...parents, ...children].map((spec) => [spec.name, spec.serialized])),
      };
    }
  });
  // Only reached when the transaction committed — a throw (including
  // afterReplace's guard) rolls back, and the old baseline still matches.
  if (nextBaseline) publishedBaselines.set(database, nextBaseline);
  else publishedBaselines.delete(database);
  notifyDataChanged();
}

// ── Publishing: full replace, or only the rows that changed ─────────────────
//
// Every publish derives the WHOLE projection (deriveDashboard stays the one
// owner of attribution, dedup and reconciliation). What changes is how much
// of it is written: a new SMS alters a handful of rows, yet a full replace
// deletes and re-inserts every row of every table — synchronously, on the JS
// thread (expo-sqlite's Drizzle driver is sync, and an async transaction
// would need a second connection that SQLCipher can't key, or would let
// screen reads interleave with a half-written projection).
//
// So a publish diffs the derived rows against the rows this process last
// committed and writes only the difference, inside the same single
// transaction — readers still see before or after, never between. The end
// state is identical to a full replace. The diff is trusted only when the
// database's projected_revision is still the one this process published: a
// fresh process, a background task's publish, or any unguarded write falls
// back to a full replace.

type ProjectionRow = Record<string, unknown>;

interface TableRows {
  name: string;
  table: SQLiteTable;
  pk: SQLiteColumn;
  rows: ProjectionRow[];
  keyOf: (row: ProjectionRow) => string;
  /** primary key → JSON of the row, for change detection. */
  serialized: Map<string, string>;
}

interface PublishedBaseline {
  revision: number | null;
  tables: Map<string, Map<string, string>>;
}

const publishedBaselines = new WeakMap<object, PublishedBaseline>();

// Keeps DELETE ... IN (...) well under SQLite's bound-parameter ceiling.
const DELETE_CHUNK_SIZE = 500;

function tableRows<Row extends object>(
  name: string,
  table: SQLiteTable,
  pk: SQLiteColumn,
  rows: readonly Row[],
  keyOf: (row: Row) => string,
): TableRows {
  // Rows are built by the same project*() functions every time, so equal
  // content always serializes to the same string.
  const serialized = new Map(rows.map((row) => [keyOf(row), JSON.stringify(row)]));
  return {
    name,
    table,
    pk,
    rows: rows as ProjectionRow[],
    keyOf: keyOf as (row: ProjectionRow) => string,
    serialized,
  };
}

function readProjectedRevision(tx: SyncSqliteDatabase): number | null {
  const row = tx
    .select({ projectedRevision: projectionState.projectedRevision })
    .from(projectionState)
    .where(eq(projectionState.id, DASHBOARD_PROJECTION_ID))
    .get();
  return row?.projectedRevision ?? null;
}

function insertAll(tx: SyncSqliteDatabase, spec: TableRows, rows: readonly ProjectionRow[]): void {
  for (const batch of batches(rows)) tx.insert(spec.table).values(batch as never).run();
}

function deleteKeys(tx: SyncSqliteDatabase, spec: TableRows, keys: readonly string[]): void {
  for (let start = 0; start < keys.length; start += DELETE_CHUNK_SIZE) {
    tx.delete(spec.table)
      .where(inArray(spec.pk, keys.slice(start, start + DELETE_CHUNK_SIZE)))
      .run();
  }
}

function writeAllRows(
  tx: SyncSqliteDatabase,
  parents: readonly TableRows[],
  children: readonly TableRows[],
): void {
  // Children before parents on delete (FKs cascade anyway, but this keeps
  // the intent explicit), parents before children on insert.
  for (const spec of [...children].reverse()) tx.delete(spec.table).run();
  for (const spec of [...parents].reverse()) tx.delete(spec.table).run();
  for (const spec of [...parents, ...children]) insertAll(tx, spec, spec.rows);
}

function writeChangedRows(
  tx: SyncSqliteDatabase,
  parents: readonly TableRows[],
  children: readonly TableRows[],
  baseline: PublishedBaseline,
): void {
  const previous = (spec: TableRows) => baseline.tables.get(spec.name) ?? new Map<string, string>();

  // 1. Children that were removed OR changed go first. Nothing references a
  //    child row, so deleting one cascades nowhere, and clearing changed rows
  //    frees their unique slots (transactions.sms_id, activity's
  //    (sms_id, category), mandate_events.sms_id) before re-insertion.
  for (const spec of children) {
    const old = previous(spec);
    const stale = [...old.keys()].filter((key) => spec.serialized.get(key) !== old.get(key));
    deleteKeys(tx, spec, stale);
  }

  // 2. Parents are updated IN PLACE, never deleted and re-inserted: deleting
  //    an account would cascade to its transactions and balance readings.
  for (const spec of parents) {
    const old = previous(spec);
    const added: ProjectionRow[] = [];
    for (const row of spec.rows) {
      const key = spec.keyOf(row);
      const before = old.get(key);
      if (before === undefined) added.push(row);
      else if (before !== spec.serialized.get(key)) {
        tx.update(spec.table).set(row as never).where(eq(spec.pk, key)).run();
      }
    }
    insertAll(tx, spec, added);
  }

  // 3. New and changed children, now that every parent they point at exists.
  for (const spec of children) {
    const old = previous(spec);
    insertAll(
      tx,
      spec,
      spec.rows.filter((row) => {
        const key = spec.keyOf(row);
        return old.get(key) !== spec.serialized.get(key);
      }),
    );
  }

  // 4. Removed parents last. Every surviving child already points at a
  //    surviving parent, so the FK cascades here reach nothing that remains.
  for (const spec of [...parents].reverse()) {
    const old = previous(spec);
    deleteKeys(
      tx,
      spec,
      [...old.keys()].filter((key) => !spec.serialized.has(key)),
    );
  }
}

