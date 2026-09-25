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
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
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
  detectedAccounts,
  mandateEvents,
  mandates,
  subscriptions,
  transactions,
} from "./schema";
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

// Replaces every normalized-table row with what the given Dashboard
// (already derived from the full, current sms_ledger — see
// ingestion.ts's ingestSmsBatch) says should exist. Delete-then-insert,
// not incremental upsert-and-prune: deriveDashboard's own attribution
// (which account a transaction belongs to, which readings survive
// dedup, mandate status as of the latest message) can change an
// already-projected row's foreign key or field values, and computing a
// precise incremental diff would just be reimplementing deriveDashboard's
// logic a second time. Runs inside one transaction so a reader never
// observes a half-replaced projection.
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
  const { dashboard, allSubscriptions } = projection;
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

  database.transaction((tx) => {
    // Children before parents on delete (FKs cascade anyway, but this
    // keeps the intent explicit), parents before children on insert.
    tx.delete(mandateEvents).run();
    tx.delete(mandates).run();
    tx.delete(subscriptions).run();
    tx.delete(activity).run();
    tx.delete(transactions).run();
    tx.delete(balanceReadings).run();
    tx.delete(detectedAccounts).run();
    tx.delete(accounts).run();

    for (const batch of batches(accountRows)) tx.insert(accounts).values(batch).run();
    for (const batch of batches(detectedAccountRows)) {
      tx.insert(detectedAccounts).values(batch).run();
    }
    for (const batch of batches(balanceReadingRows)) {
      tx.insert(balanceReadings).values(batch).run();
    }
    for (const batch of batches(transactionRows)) tx.insert(transactions).values(batch).run();
    for (const batch of batches(activityRows)) tx.insert(activity).values(batch).run();
    for (const batch of batches(subscriptionRows)) {
      tx.insert(subscriptions).values(batch).run();
    }
    for (const batch of batches(mandateRows)) tx.insert(mandates).values(batch).run();
    for (const batch of batches(mandateEventRows)) tx.insert(mandateEvents).values(batch).run();
    afterReplace?.(tx);
  });
}
