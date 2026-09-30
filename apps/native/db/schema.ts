// On-device SQLite schema (local-first — see GitHub issue #17). Deliberately
// separate from packages/db/src/schema/transactions.ts: that schema is
// Postgres-specific, FK'd to an authenticated server user, and stores raw
// SMS server-side — none of that shape belongs on-device. A future sync
// layer maps rows between the two; it does not require either to change.
//
// Foreign keys are declared here but SQLite ignores them unless the
// connection runs `PRAGMA foreign_keys = ON` — see db/native-init.ts.
//
// Every money column is an integer in minor units (paise for INR, cents for
// USD, ...), not SQLite REAL — see lib/currency.ts. Binary floating point
// can't represent decimal currency amounts exactly, and this schema hasn't
// shipped yet, so there's no reason to let that assumption spread into
// ingestion code.
import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  check,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import { STORED_ACTIVITY_CATEGORIES } from "../lib/activity-filters";

// ── Ledger layer ────────────────────────────────────────────────────────────
// One row per SMS ever ingested. This is the reprocessing source of truth:
// when @zeeya/parser's version changes, `parserVersion` tells us which rows
// need re-parsing from `body` — nothing else needs to be re-read from the
// device inbox. `body` never leaves the device (see issue #17's "No SMS
// content is uploaded" acceptance criterion) — this table has no server
// counterpart today.
export const smsLedger = sqliteTable(
  "sms_ledger",
  {
    // The row's sole identity: computeFingerprint(sender, date, body) —
    // see ingestion.ts. Deliberately NOT the Android content-provider
    // `_id`: an internal id built from a caller-supplied external
    // identifier (which may be absent, may get reused across genuinely
    // different messages, or may need to move between rows) makes
    // ownership transfer and cross-namespace collision handling
    // needlessly hard — a row's own primary key should never need to
    // change hands. providerId below is purely an attribute: nullable,
    // unique when present, and free to be set, cleared, or reassigned to
    // a different row via an ordinary UPDATE, exactly like any other
    // column.
    id: text("id").primaryKey(),
    providerId: text("provider_id"),
    sender: text("sender").notNull(),
    body: text("body").notNull(),
    date: integer("date").notNull(), // epoch ms, matches RawSms.date
    parserVersion: text("parser_version").notNull(),
    // JSON.stringify(MalanaResult) — null when ingestionStatus is "error"
    // (parsing threw, so there is no result to serialize). Kept as opaque
    // JSON rather than a wide flat table — MalanaResult has 50+ category-
    // specific optional fields (travel/delivery/bill/OTP/...) and nothing
    // outside the ledger needs to query most of them directly; the
    // normalized tables below cover what the dashboard actually reads.
    parsedResult: text("parsed_result"),
    ingestionStatus: text("ingestion_status", { enum: ["parsed", "error"] }).notNull(),
    ingestionError: text("ingestion_error"),
    createdAt: integer("created_at").notNull(),
    // Bumped by the sms_ledger_parse_revision_bump TRIGGER (baseline SQL)
    // whenever parser_version / parsed_result / ingestion_status is updated —
    // by any writer, so no code path can forget it. Rows are only ever
    // inserted (never replaced or deleted), so (id, parse_revision)
    // identifies one exact parse: db/ingestion.ts's decoded-ledger cache
    // keys on it to re-decode only rows whose parse actually changed.
    parseRevision: integer("parse_revision").notNull().default(0),
  },
  (table) => [
    index("sms_ledger_date_idx").on(table.date),
    uniqueIndex("sms_ledger_provider_id_idx").on(table.providerId),
    check(
      "sms_ledger_parsed_result_matches_status",
      sql`(${table.ingestionStatus} = 'parsed' AND ${table.parsedResult} IS NOT NULL AND ${table.ingestionError} IS NULL) OR (${table.ingestionStatus} = 'error' AND ${table.parsedResult} IS NULL AND ${table.ingestionError} IS NOT NULL)`,
    ),
  ],
);

// Monotonic local arrival order, independent of the SMS's own timestamp.
// A delayed or historical message can have an old `date` but still be newly
// caught up by this installation, so transaction-date cursors cannot power
// the "captured while you were away" UI correctly. This append-only sequence
// survives projection rebuilds; the normalized transactions table can join
// by smsId without reading raw ledger content.
export const smsArrivals = sqliteTable(
  "sms_arrivals",
  {
    sequence: integer("sequence").primaryKey({ autoIncrement: true }),
    smsId: text("sms_id")
      .notNull()
      .references(() => smsLedger.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("sms_arrivals_sms_id_idx").on(table.smsId)],
);

// Every time ingestion sees a provider id for some content that a
// *different* row already legitimately owns (the provider_id unique index
// on smsLedger allows exactly one owner), that's recorded here rather than
// silently resolved — a single nullable column on smsLedger can't
// represent more than one contest against the same row, can't carry when
// it was detected, and has no way to distinguish "never contested" from
// "was contested, then resolved." One row per detected contest instead.
//
// `resolvedAt` is write-only for now (nothing in ingestSmsBatch sets it —
// there's no reconciliation pass yet that decides a contest is over) but
// exists so a future pass has somewhere to record that, the same way
// smsLedger.parserVersion existed before anything read it back.
export const identityConflicts = sqliteTable(
  "identity_conflicts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    smsId: text("sms_id")
      .notNull()
      .references(() => smsLedger.id, { onDelete: "cascade" }),
    contestedProviderId: text("contested_provider_id").notNull(),
    detectedAt: integer("detected_at").notNull(),
    resolvedAt: integer("resolved_at"),
  },
  (table) => [
    index("identity_conflicts_sms_id_idx").on(table.smsId),
    // Re-ingesting the same batch (or an overlapping one) must not create
    // a second open record of the exact same contest — this is what makes
    // recording a conflict as idempotent (onConflictDoNothing-safe) as the
    // rest of ingestSmsBatch's writes.
    uniqueIndex("identity_conflicts_open_unique")
      .on(table.smsId, table.contestedProviderId)
      .where(sql`${table.resolvedAt} IS NULL`),
  ],
);

// Single-row bookkeeping for incremental ingestion (issue #17: "Save a
// durable checkpoint" + "small overlap window" for delayed/out-of-order
// SMS). `id` is a fixed scope key so this can extend to multiple scopes
// (e.g. a future non-inbox source) without a schema change.
export const syncCheckpoint = sqliteTable("sync_checkpoint", {
  id: text("id").primaryKey(),
  lastIngestedDate: integer("last_ingested_date"),
  lastIngestedProviderId: text("last_ingested_provider_id"),
  // When the bounded last-90-days initial historical scan finished —
  // independent of lastIngestedDate, which only advances when a batch
  // actually contains messages. A phone number with zero recognized SMS
  // in that window would otherwise leave lastIngestedDate null forever,
  // making every future app launch look like a first-ever sync again and
  // repeat the same pointless 90-day scan indefinitely. Set once, on
  // completion, regardless of whether anything was found.
  initialScanCompletedAt: integer("initial_scan_completed_at"),
  updatedAt: integer("updated_at").notNull(),
});

/** The single projection_state row's id. */
export const DASHBOARD_PROJECTION_ID = "dashboard";

// Durable freshness marker for the normalized dashboard/query tables.
// Ledger writes advance sourceRevision in the same transaction as the
// source change. A successful atomic projection replacement advances
// projectedRevision to the exact source revision it was derived from.
// A mismatch therefore survives process death and tells the next reader
// that the query tables must be rebuilt before use.
export const projectionState = sqliteTable(
  "projection_state",
  {
    id: text("id").primaryKey(),
    sourceRevision: integer("source_revision").notNull().default(0),
    projectedRevision: integer("projected_revision").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    check(
      "projection_state_revision_check",
      sql`${table.sourceRevision} >= 0 AND ${table.projectedRevision} >= 0 AND ${table.projectedRevision} <= ${table.sourceRevision}`,
    ),
  ],
);

// User-controlled, device-local capability preferences. These flags are
// intentionally separate from authentication/profile data: they configure
// what this installation may do in the background or while displaying
// sensitive financial information. Biometric results and encryption keys
// are never persisted here.
export const localSettings = sqliteTable(
  "local_settings",
  {
    id: text("id").primaryKey(),
    backgroundSyncEnabled: integer("background_sync_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    transactionNotificationsEnabled: integer("transaction_notifications_enabled", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    biometricLockEnabled: integer("biometric_lock_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    screenCaptureProtectionEnabled: integer("screen_capture_protection_enabled", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    // Optional user-configured daily target used by budget analytics. A
    // missing value means "no budget configured"; it is never inferred from
    // transaction spend or account balances.
    dailyBudgetMinorUnits: integer("daily_budget_minor_units"),
    // Durable presentation cursor, not a capability preference. Kept on
    // this installation-scoped singleton so a background catch-up followed
    // by process death still appears once when Home next starts.
    lastSeenArrivalSequence: integer("last_seen_arrival_sequence").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    check(
      "local_settings_boolean_values",
      sql`${table.backgroundSyncEnabled} IN (0, 1) AND ${table.transactionNotificationsEnabled} IN (0, 1) AND ${table.biometricLockEnabled} IN (0, 1) AND ${table.screenCaptureProtectionEnabled} IN (0, 1)`,
    ),
    check(
      "local_settings_daily_budget_check",
      sql`${table.dailyBudgetMinorUnits} IS NULL OR (typeof(${table.dailyBudgetMinorUnits}) = 'integer' AND ${table.dailyBudgetMinorUnits} > 0)`,
    ),
    check("local_settings_arrival_cursor_check", sql`${table.lastSeenArrivalSequence} >= 0`),
  ],
);

// A monthly spending limit per category, set by the user. User-owned: the
// projection rebuild (replaceProjection) never touches it, so budgets
// survive every re-sync. `category` is the same display label transactions
// carry (lib/transaction-category.ts) — a budget follows spending tagged
// with that label, in one currency.
export const categoryBudgets = sqliteTable(
  "category_budgets",
  {
    category: text("category").notNull(),
    currency: text("currency").notNull(),
    monthlyLimitMinorUnits: integer("monthly_limit_minor_units").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.category, table.currency] }),
    check(
      "category_budgets_limit_check",
      sql`typeof(${table.monthlyLimitMinorUnits}) = 'integer' AND ${table.monthlyLimitMinorUnits} > 0`,
    ),
  ],
);

// ── Normalized layer ─────────────────────────────────────────────────────────
// Derived from the ledger on ingest. Shaped close to what apps/native's
// existing dashboard.ts (deriveDashboard) already computes in-memory, and
// close enough to packages/db's server transaction schema that a future
// sync layer can map rows mechanically without redesigning either side.

export const accounts = sqliteTable(
  "accounts",
  {
    // `${normalizedBankName}|${last4}` — mirrors dashboard.ts's accountKey().
    id: text("id").primaryKey(),
    bankName: text("bank_name").notNull(),
    // dashboard.ts's normalizeBankName(bankName) — the canonical grouping
    // key, computed once at projection time (mirrors balance_readings'
    // detectedBankKey exactly, same reason: querying/joining on the raw
    // bankName would silently miss/misgroup accounts whose real bank name
    // differs only in casing or whitespace across messages). Used by
    // Home's hasNewerSuggestedReading cross-check to match an account
    // against balance_readings.detectedBankKey without re-normalizing in
    // SQL or duplicating normalizeBankName's rules there.
    bankKey: text("bank_key").notNull(),
    last4: text("last4").notNull(),
    currency: text("currency").notNull(),
    // "unreported" mirrors dashboard.ts's UnanchoredAccountBalance: no bank
    // has ever reported a balance for this account (only transaction/mandate
    // evidence exists). balanceMinorUnits/estimatedBalanceMinorUnits are
    // genuinely NULL in that case (enforced by the CHECK below), never a
    // placeholder 0 — a 0 in either column is only ever a real reported
    // zero balance.
    anchorStatus: text("anchor_status", { enum: ["reported", "unreported"] }).notNull(),
    balanceMinorUnits: integer("balance_minor_units"),
    balanceAsOf: integer("balance_as_of").notNull(),
    balanceSender: text("balance_sender").notNull(),
    estimatedBalanceMinorUnits: integer("estimated_balance_minor_units"),
    estimatedAsOf: integer("estimated_as_of").notNull(),
    reconciliationDeltaMinorUnits: integer("reconciliation_delta_minor_units"),
    // Account-level captured activity — dashboard.ts's AccountBalance already
    // computes these (summing captured transactions against the account's
    // own anchor, the same reconciliation dashboard.ts's own captured*
    // fields already do), so this persists that existing result rather than
    // independently recomputing it in SQL. Always a real integer (never
    // null) — an account with zero captured transactions since its anchor
    // genuinely has 0 for all four, the same "0 means 0, not unknown" rule
    // balance/estimatedBalance's own nullability CHECK enforces elsewhere
    // on this table.
    capturedIncomeMinorUnits: integer("captured_income_minor_units").notNull(),
    capturedExpenseMinorUnits: integer("captured_expense_minor_units").notNull(),
    capturedChangeMinorUnits: integer("captured_change_minor_units").notNull(),
    capturedTransactionCount: integer("captured_transaction_count").notNull(),
  },
  (table) => [
    // Covers Home's hasNewerSuggestedReading cross-check: WHERE bank_key = ?
    // AND currency = ? — used both to find every account sharing a
    // candidate unassigned reading's bank+currency (the "sole candidate"
    // rule) and to join against balance_readings.detected_bank_key.
    index("accounts_bank_key_currency_idx").on(table.bankKey, table.currency),
    check("accounts_anchor_status_check", sql`${table.anchorStatus} IN ('reported', 'unreported')`),
    check(
      "accounts_anchor_status_balance_nullability_check",
      sql`(${table.anchorStatus} = 'reported' AND ${table.balanceMinorUnits} IS NOT NULL AND ${table.estimatedBalanceMinorUnits} IS NOT NULL)
       OR (${table.anchorStatus} = 'unreported' AND ${table.balanceMinorUnits} IS NULL AND ${table.estimatedBalanceMinorUnits} IS NULL)`,
    ),
    check("accounts_captured_transaction_count_check", sql`${table.capturedTransactionCount} >= 0`),
    // Mirrors dashboard.ts's own captured-income/expense/change arithmetic
    // exactly (capturedIncome and capturedExpense both accumulate as
    // non-negative sums — see AccountBalanceBase's own ledgerEntries loop
    // — and capturedChange is defined as their difference), so these are
    // real invariants of what projectAccount() writes, not looser rules a
    // future write path could silently violate.
    check(
      "accounts_captured_income_expense_nonnegative_check",
      sql`${table.capturedIncomeMinorUnits} >= 0 AND ${table.capturedExpenseMinorUnits} >= 0`,
    ),
    check(
      "accounts_captured_change_check",
      sql`${table.capturedChangeMinorUnits} = ${table.capturedIncomeMinorUnits} - ${table.capturedExpenseMinorUnits}`,
    ),
    check(
      "accounts_captured_zero_count_check",
      sql`${table.capturedTransactionCount} != 0 OR (${table.capturedIncomeMinorUnits} = 0 AND ${table.capturedExpenseMinorUnits} = 0 AND ${table.capturedChangeMinorUnits} = 0)`,
    ),
  ],
);

// Weaker account-identity evidence that has not yet carried either a real
// transaction or a bank-reported balance (dashboard.ts's DetectedAccount) —
// e.g. a mandate notice that named a bank+account but never a transaction
// amount or balance. `deriveDashboardProjection` already excludes any key
// also present in `accountsByKey` before returning `detectedAccounts` (see
// lib/dashboard.ts), so a row here and a row in `accounts` can never share
// an id — the same accountRowId() normalization is reused for both tables.
export const detectedAccounts = sqliteTable("detected_accounts", {
  id: text("id").primaryKey(),
  bankName: text("bank_name").notNull(),
  last4: text("last4").notNull(),
  currency: text("currency").notNull(),
  asOf: integer("as_of").notNull(),
  sender: text("sender").notNull(),
});

export const balanceReadings = sqliteTable(
  "balance_readings",
  {
    id: text("id").primaryKey(), // same id as the originating smsLedger row
    smsId: text("sms_id")
      .notNull()
      .references(() => smsLedger.id, { onDelete: "cascade" }),
    // Null for an unassigned reading (parser found a balance but no account
    // digits, and more than one confirmed account shares that bank+currency
    // — see dashboard.ts's resolveTransactionAccountKey ambiguity handling).
    accountId: text("account_id").references(() => accounts.id, { onDelete: "cascade" }),
    balanceMinorUnits: integer("balance_minor_units").notNull(),
    currency: text("currency").notNull(),
    asOf: integer("as_of").notNull(),
    // The raw, as-parsed bank name — display-only. Never queried/filtered
    // on directly: two readings can carry different casing/whitespace for
    // the same real bank (e.g. "State Bank of India" vs "  STATE BANK OF
    // INDIA "), and dashboard.ts's own unassignedReadingsByBank already
    // groups by the normalized form, not this one. See detectedBankKey.
    detectedBankName: text("detected_bank_name").notNull(),
    // dashboard.ts's normalizeBankName(detectedBankName) — the canonical
    // grouping key, computed once at projection time and queried/indexed
    // on directly so a bank-name lookup can never silently miss readings
    // that differ only in casing or whitespace from whatever the most
    // recent SMS happened to use.
    detectedBankKey: text("detected_bank_key").notNull(),
    detectedAccount: text("detected_account"),
    associationKind: text("association_kind", {
      enum: ["confirmed", "suggested", "unassigned"],
    }).notNull(),
    sender: text("sender").notNull(),
    // Reconciliation against the previous reading for this account, if any.
    reconciliationPreviousAsOf: integer("reconciliation_previous_as_of"),
    reconciliationExpectedBalanceMinorUnits: integer("reconciliation_expected_balance_minor_units"),
    reconciliationDeltaMinorUnits: integer("reconciliation_delta_minor_units"),
    capturedIncomeMinorUnits: integer("captured_income_minor_units"),
    capturedExpenseMinorUnits: integer("captured_expense_minor_units"),
    capturedTransactionCount: integer("captured_transaction_count"),
  },
  (table) => [
    // Covers queryBalanceHistory's exact access pattern: WHERE account_id = ?
    // [AND keyset predicate on (as_of, id)] ORDER BY as_of DESC, id DESC —
    // one index serves the filter, the keyset comparison, and the sort with
    // no separate temp b-tree (see queries-accounts.test.ts's EXPLAIN QUERY
    // PLAN assertions). Replaces the old single-column account_id index,
    // which this subsumes for every current query against the table.
    index("balance_readings_account_id_as_of_id_idx").on(table.accountId, table.asOf, table.id),
    // Covers queryUnassignedReadings's pattern: WHERE detected_bank_key = ?
    // AND account_id IS NULL [AND keyset predicate] ORDER BY as_of DESC, id
    // DESC. account_id is included so SQLite can seek directly to the NULL
    // sub-range instead of scanning every reading for the bank. Keyed on
    // the canonical detectedBankKey, not the raw detectedBankName, so a
    // lookup can't silently miss readings whose raw name differs only in
    // casing/whitespace.
    index("balance_readings_bank_key_account_as_of_id_idx").on(
      table.detectedBankKey,
      table.accountId,
      table.asOf,
      table.id,
    ),
    check(
      "balance_readings_association_kind_check",
      sql`${table.associationKind} IN ('confirmed', 'suggested', 'unassigned')`,
    ),
    // A reading only ever gets a non-null account_id when projectBalanceReading
    // is called with a real account's id — which db/projections.ts only does
    // for readings inside a confirmed AccountBalance.history (association
    // kind 'confirmed'). Every reading in bank.unassignedReadings — kind
    // 'suggested' or 'unassigned' — is always projected with accountId null,
    // even once 'suggested' picks a sole-candidate account for display; the
    // suggestion is presentation-only and never becomes a real foreign key.
    check(
      "balance_readings_association_kind_account_id_check",
      sql`(${table.associationKind} = 'confirmed' AND ${table.accountId} IS NOT NULL)
       OR (${table.associationKind} IN ('suggested', 'unassigned') AND ${table.accountId} IS NULL)`,
    ),
  ],
);

export const transactions = sqliteTable(
  "transactions",
  {
    // dashboard.ts's referencedTransactionKey when the SMS carries a
    // reference number (institution|acc|ref|amount|currency|direction),
    // otherwise the originating smsLedger row's id. Either way this is the
    // dedup key: re-ingesting the same SMS can never create a second row.
    id: text("id").primaryKey(),
    smsId: text("sms_id")
      .notNull()
      .references(() => smsLedger.id, { onDelete: "cascade" }),
    accountId: text("account_id").references(() => accounts.id, { onDelete: "cascade" }),
    amountMinorUnits: integer("amount_minor_units").notNull(),
    currency: text("currency").notNull(),
    direction: text("direction", { enum: ["income", "expense", "neutral"] }).notNull(),
    trxTypeRich: text("trx_type_rich"),
    vendor: text("vendor"),
    brandName: text("brand_name"),
    merchantCategory: text("merchant_category"),
    // The parser's raw grammar-seed token (upi/neft/imps/mandate/...) —
    // apps/native/features/home-preview/data.ts's categoryName() falls
    // back to this whenever merchantCategory is null, so a category
    // breakdown that only reads merchantCategory silently drops every
    // transaction whose only category signal is this field.
    subcategory: text("subcategory"),
    // Canonical display/filter key derived once during projection. Keeping
    // this normalized value beside the raw parser fields guarantees a category
    // pill such as "Upi" queries the same bucket the aggregate UI displays.
    category: text("category").notNull(),
    ref: text("ref"),
    bankName: text("bank_name"),
    date: integer("date").notNull(),
    mandateId: text("mandate_id"),
    // lib/subscriptions.ts's subscriptionIdentityKey(brandName ?? vendor,
    // currency) — computed once at projection time, in JS. That function is
    // the single owner of this composite format: it's the same call
    // subscriptions.id and allQualifyingSubscriptions's own candidate
    // grouping both use, so there is exactly one place the
    // normalizeMerchant+currency format is defined (SQL has no equivalent
    // of normalizeMerchant's regex/lowercasing rules, hence precomputing
    // this in JS at all).
    // A query-time recurrence check (Home's isRecurring — see
    // dashboard-data.ts's own comment) can then join this column against
    // subscriptions.id with plain equality, never a partial/merchant-only
    // match that a different currency's identically-named merchant could
    // false-positive against. Null when there is no usable merchant name
    // at all: no brandName/vendor present, or normalizeMerchant strips it
    // down to an empty string (e.g. "---") — either way there is no real
    // identity to key on, so this is null rather than a degenerate
    // "|INR"-shaped value. Never falls back to bankName or another field,
    // since that would silently create false subscription matches.
    subscriptionIdentityKey: text("subscription_identity_key"),
  },
  (table) => [
    index("transactions_account_id_idx").on(table.accountId),
    index("transactions_date_idx").on(table.date),
    // The hot read shape: one currency, one direction (or the income/expense
    // pair), a date range, newest first. Serves the transaction page with no
    // scan or sort (it was a full SCAN + temp b-tree), narrows every Insights,
    // highlights, series and cadence aggregate to its currency+direction
    // slice, and makes queryDistinctCurrencies a covering-index scan.
    index("transactions_currency_direction_date_id_idx").on(
      table.currency,
      table.direction,
      table.date,
      table.id,
    ),
    uniqueIndex("transactions_sms_id_idx").on(table.smsId),
    check(
      "transactions_direction_check",
      sql`${table.direction} IN ('income', 'expense', 'neutral')`,
    ),
  ],
);

// Every recognized category match for a message (MalanaResult.matchedCategories
// — a message can match more than one, e.g. GRM_BANK + GRM_NOTIF), including
// GRM_BANK for messages that also produced a `transactions` row. This is a
// thin index, not a content table: category-specific detail (PNR, tracking
// id, order status, ...) stays in smsLedger.parsedResult JSON, joined back
// on read. Exists so "all activity in category X, newest first" is an
// indexed query instead of deserializing every ledger row — mirrors
// apps/native/lib/activity-filters.ts's ACTIVITY_CATEGORY_FILTERS.
export const activity = sqliteTable(
  "activity",
  {
    id: text("id").primaryKey(), // `${smsId}|${category}`
    smsId: text("sms_id")
      .notNull()
      .references(() => smsLedger.id, { onDelete: "cascade" }),
    // lib/activity-filters.ts's STORED_ACTIVITY_CATEGORIES is the single
    // canonical tuple this set is derived from — projectActivityRows only
    // ever writes a category PRODUCT_CATEGORIES already filtered to this
    // exact set, so the CHECK below (also derived from the same tuple, not
    // a separately hand-copied list) makes that guarantee a database-level
    // fact, not just a convention two separately-maintained lists could
    // silently drift from.
    category: text("category", { enum: STORED_ACTIVITY_CATEGORIES }).notNull(),
    date: integer("date").notNull(),
    // Row-presentation fields only — the small set
    // features/home-preview/data.ts's buildActivity actually reads to build
    // one ActivityItem row (name/date/pills). Not every activity row is a
    // financial transaction (travel/delivery/OTP/offers messages have none),
    // so these can't be sourced by joining `transactions` — a non-financial
    // row would just have amountMinorUnits/currency/direction null here.
    // Category-specific detail (PNR, tracking id, ...) still stays in
    // smsLedger.parsedResult, read only by the single-row transaction detail
    // join — never scanned for a list.
    bankName: text("bank_name"),
    brandName: text("brand_name"),
    vendor: text("vendor"),
    trxTypeRich: text("trx_type_rich"),
    subcategory: text("subcategory"),
    mandateEvent: text("mandate_event", { enum: ["active", "cancelled"] }),
    isFromCard: integer("is_from_card", { mode: "boolean" }).notNull().default(false),
    amountMinorUnits: integer("amount_minor_units"),
    currency: text("currency"),
    direction: text("direction", { enum: ["income", "expense", "neutral"] }),
    // Added for the Home read model's one-row-per-SMS activity DTO —
    // merchantName()'s fallback chain (brandName -> vendor -> bene ->
    // bankName -> sender) and categorySuggestions's merchantCategory-
    // derived chip both need these, and neither existed on this table
    // before. `sender` is the originating SMS's sender id (e.g.
    // "VM-HDFCBK") — the same value smsLedger.sender already carries,
    // duplicated here so a Home activity read never needs to join back to
    // the ledger.
    bene: text("bene"),
    merchantCategory: text("merchant_category"),
    sender: text("sender").notNull(),
    // Resolved during projection via lib/activity-account-attribution.ts —
    // null when bank/currency/last4 evidence is missing or ambiguous.
    accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
  },
  (table) => [
    uniqueIndex("activity_sms_category_idx").on(table.smsId, table.category),
    // Covers the category-filtered list access pattern: WHERE category = ?
    // [AND date range] ORDER BY date DESC, id DESC — one index serves the
    // filter, keyset comparison, and sort with no separate temp sort.
    index("activity_category_date_id_idx").on(table.category, table.date, table.id),
    // Covers the unfiltered "all activity" pattern: ORDER BY date DESC, id
    // DESC with no category predicate — the composite index above can't
    // serve that (its category column is the leading key, so SQLite has no
    // way to use it for a query with no category equality condition), which
    // without this index means the default `{}` query scans the whole
    // table and builds a temp b-tree to sort it. See
    // queries-transactions.test.ts's EXPLAIN QUERY PLAN test against the
    // real unfiltered production query.
    index("activity_date_id_idx").on(table.date, table.id),
    // Home's bounded stage-1 candidate query (db/queries-home.ts's
    // queryHomeActivityRows) orders by (date DESC, sms_id DESC) — a
    // different tiebreaker than activity_date_id_idx/
    // activity_category_date_id_idx above, which key on this table's own id
    // (`${smsId}|${category}`) for queryActivityPage's keyset pagination.
    // Without an index whose tiebreaker actually matches sms_id, SQLite must
    // fully sort every same-`date` group by sms_id in a temp b-tree before
    // LIMIT can apply — unbounded work for a burst of same-timestamp rows
    // (e.g. a bulk ingest landing in the same millisecond). These two
    // indexes make that ORDER BY entirely index-served.
    index("activity_date_sms_id_idx").on(table.date, table.smsId),
    index("activity_category_date_sms_id_idx").on(table.category, table.date, table.smsId),
    // Account-scoped activity feed: WHERE account_id = ? ORDER BY date DESC, id DESC.
    index("activity_account_id_date_id_idx").on(table.accountId, table.date, table.id),
    check(
      "activity_mandate_event_check",
      sql`${table.mandateEvent} IS NULL OR ${table.mandateEvent} IN ('active', 'cancelled')`,
    ),
    check(
      "activity_direction_check",
      sql`${table.direction} IS NULL OR ${table.direction} IN ('income', 'expense', 'neutral')`,
    ),
    // Built from STORED_ACTIVITY_CATEGORIES (lib/activity-filters.ts), not a
    // second hand-copied literal list — sql.raw is required here (not a
    // bound sql.param placeholder) because a CHECK constraint's condition
    // is baked into the table's DDL text itself; SQLite does not accept
    // bind parameters inside CHECK. Every one of STORED_ACTIVITY_CATEGORIES'
    // own values is a fixed, compile-time-known identifier-safe string
    // (never user input), so building this literal from it carries no
    // injection risk.
    check(
      "activity_category_check",
      sql`${table.category} IN (${sql.raw(STORED_ACTIVITY_CATEGORIES.map((c) => `'${c}'`).join(", "))})`,
    ),
    // A financial activity row (one whose message also produced a
    // transactions row — see projectActivityRows's financialRow parameter)
    // always has all three of amount/currency/direction; a non-financial
    // one always has none. SQLite would otherwise permit a contradictory
    // partial combination like an amount with no currency.
    check(
      "activity_financial_fields_check",
      sql`(${table.amountMinorUnits} IS NULL AND ${table.currency} IS NULL AND ${table.direction} IS NULL)
       OR (${table.amountMinorUnits} IS NOT NULL AND ${table.currency} IS NOT NULL AND ${table.direction} IS NOT NULL)`,
    ),
  ],
);

// Autopay/mandate lifecycle — event-sourced from SMS the same way
// transactions are, not inferred, so it's persisted rather than
// recomputed (contrast with subscriptions below).
export const mandates = sqliteTable(
  "mandates",
  {
    mandateId: text("mandate_id").primaryKey(),
    merchant: text("merchant").notNull(),
    amountMinorUnits: integer("amount_minor_units"),
    currency: text("currency").notNull(),
    status: text("status", { enum: ["active", "cancelled"] }).notNull(),
    createdAt: integer("created_at").notNull(),
    lastUpdated: integer("last_updated").notNull(),
    sender: text("sender").notNull(),
  },
  (table) => [
    check("mandates_status_check", sql`${table.status} IN ('active', 'cancelled')`),
    // Covers queryMandates's access pattern: [keyset predicate on
    // (lastUpdated, mandateId)] ORDER BY lastUpdated DESC, mandateId DESC —
    // mandates are not inherently human-bounded (a cancelled/expired
    // mandate's row is never deleted, so the count grows over the ledger's
    // lifetime the same way transactions/activity do), so this list is
    // keyset-paginated like every other unbounded list in this schema.
    index("mandates_last_updated_mandate_id_idx").on(table.lastUpdated, table.mandateId),
  ],
);

export const mandateEvents = sqliteTable(
  "mandate_events",
  {
    // One mandate-context SMS produces at most one event, so the originating
    // smsId doubles as this row's id — that's also what makes reprocessing
    // safe: replacing a mandate event after a parser-version change means
    // deleting the row for that smsId and re-inserting, not guessing which
    // of several rows for a mandate came from which message.
    id: text("id").primaryKey(),
    smsId: text("sms_id")
      .notNull()
      .references(() => smsLedger.id, { onDelete: "cascade" }),
    mandateId: text("mandate_id")
      .notNull()
      .references(() => mandates.mandateId, { onDelete: "cascade" }),
    status: text("status", { enum: ["active", "cancelled"] }).notNull(),
    date: integer("date").notNull(),
    sender: text("sender").notNull(),
  },
  (table) => [
    uniqueIndex("mandate_events_sms_id_idx").on(table.smsId),
    // Covers queryMandateEvents's access pattern: WHERE mandate_id = ? [AND
    // keyset predicate on (date, id)] ORDER BY date DESC, id DESC — one
    // index serves the filter, keyset comparison, and sort with no
    // separate temp sort. Replaces the old single-column mandate_id index,
    // which this subsumes.
    index("mandate_events_mandate_id_date_id_idx").on(table.mandateId, table.date, table.id),
    check("mandate_events_status_check", sql`${table.status} IN ('active', 'cancelled')`),
  ],
);

// Inferred recurring payments (subscriptions.ts's deriveSubscriptions),
// distinct from `mandates` above: a mandate is confirmed Autopay/standing-
// instruction evidence with a real UMN; this is a same-merchant-and-amount
// heuristic over ordinary transaction messages, so it also catches
// subscriptions with no mandate SMS at all (e.g. a card-billed Netflix).
// `deriveSubscriptions` excludes anything with a mandateId for exactly this
// reason — the two tables never describe the same charge.
//
// This IS a rebuildable derived projection, not a second source of truth:
// `transactions` stays authoritative, and this table is replaced atomically
// alongside it inside the same replaceProjection() transaction, gated by
// the same source/projected revision tracking as every other normalized
// table. It's persisted (not recomputed from a bounded recent window on
// every read) because `count` is a real displayed field — a subscription
// with two years of unbroken monthly history must keep reporting its true
// occurrence count, which a bounded window would silently truncate.
// Recency (`lastDate` older than RECENCY_WINDOW_DAYS) is still a query-time
// filter, not a write-time one, so an entry can expire with no new SMS.
export const subscriptions = sqliteTable(
  "subscriptions",
  {
    // `${normalizeMerchant(merchant)}|${currency}` — subscriptions.ts's own
    // internal grouping key, and already what
    // features/home-preview/data.ts's previewFromSubscription synthesizes
    // as a UI key today, so this is the existing implicit identity made
    // explicit rather than a new one.
    id: text("id").primaryKey(),
    merchant: text("merchant").notNull(),
    amountMinorUnits: integer("amount_minor_units").notNull(),
    currency: text("currency").notNull(),
    count: integer("count").notNull(),
    lastDate: integer("last_date").notNull(),
    confidence: text("confidence", { enum: ["likely", "possible"] }).notNull(),
  },
  (table) => [
    // Covers both db/queries.ts's querySubscriptions (WHERE last_date >= ?
    // ORDER BY last_date DESC, no LIMIT) and Home's subscription-preview
    // candidate query (db/queries-home.ts's querySubscriptionPreviewCandidates:
    // WHERE last_date >= ? ORDER BY last_date DESC, id DESC LIMIT ?) — id is
    // the tiebreaker for subscriptions sharing the exact same last_date, the
    // same pattern every other keyset-ordered table in this schema uses.
    // Subsumes the single-column (last_date) index a leading-column
    // composite index would otherwise duplicate: every query that could use
    // a last_date-only index can use this one instead, so there is no
    // second index to keep in sync on every write.
    index("subscriptions_last_date_id_idx").on(table.lastDate, table.id),
    // Mirrors lib/subscriptions.ts's own rule exactly: a qualifying run
    // shorter than 2 occurrences is rejected before a Subscription is ever
    // built (run.length < 2 → continue), so "possible" (< 3 occurrences)
    // can only ever be exactly 2, and "likely" only ever 3+. Enforced here
    // too so a future write path can't silently drift from that rule.
    check(
      "subscriptions_confidence_check",
      sql`typeof(${table.count}) = 'integer' AND (
        (${table.confidence} = 'possible' AND ${table.count} = 2)
        OR
        (${table.confidence} = 'likely' AND ${table.count} >= 3)
      )`,
    ),
  ],
);
