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
// USD, ...), not SQLite REAL — see db/currency.ts. Binary floating point
// can't represent decimal currency amounts exactly, and this schema hasn't
// shipped yet, so there's no reason to let that assumption spread into
// ingestion code.
import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, uniqueIndex, check } from "drizzle-orm/sqlite-core";

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
  updatedAt: integer("updated_at").notNull(),
});

// ── Normalized layer ─────────────────────────────────────────────────────────
// Derived from the ledger on ingest. Shaped close to what apps/native's
// existing dashboard.ts (deriveDashboard) already computes in-memory, and
// close enough to packages/db's server transaction schema that a future
// sync layer can map rows mechanically without redesigning either side.

export const accounts = sqliteTable("accounts", {
  // `${normalizedBankName}|${last4}` — mirrors dashboard.ts's accountKey().
  id: text("id").primaryKey(),
  bankName: text("bank_name").notNull(),
  last4: text("last4").notNull(),
  currency: text("currency").notNull(),
  balanceMinorUnits: integer("balance_minor_units").notNull(),
  balanceAsOf: integer("balance_as_of").notNull(),
  balanceSender: text("balance_sender").notNull(),
  estimatedBalanceMinorUnits: integer("estimated_balance_minor_units").notNull(),
  estimatedAsOf: integer("estimated_as_of").notNull(),
  reconciliationDeltaMinorUnits: integer("reconciliation_delta_minor_units"),
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
    detectedBankName: text("detected_bank_name").notNull(),
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
    index("balance_readings_account_id_idx").on(table.accountId),
    index("balance_readings_as_of_idx").on(table.asOf),
    check(
      "balance_readings_association_kind_check",
      sql`${table.associationKind} IN ('confirmed', 'suggested', 'unassigned')`,
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
    ref: text("ref"),
    bankName: text("bank_name"),
    date: integer("date").notNull(),
    mandateId: text("mandate_id"),
  },
  (table) => [
    index("transactions_account_id_idx").on(table.accountId),
    index("transactions_date_idx").on(table.date),
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
    category: text("category").notNull(),
    date: integer("date").notNull(),
  },
  (table) => [
    uniqueIndex("activity_sms_category_idx").on(table.smsId, table.category),
    index("activity_category_idx").on(table.category),
    index("activity_date_idx").on(table.date),
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
  (table) => [check("mandates_status_check", sql`${table.status} IN ('active', 'cancelled')`)],
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
    index("mandate_events_mandate_id_idx").on(table.mandateId),
    check("mandate_events_status_check", sql`${table.status} IN ('active', 'cancelled')`),
  ],
);

// Subscriptions are deliberately NOT a table here. They're a heuristic
// inference (subscriptions.ts's deriveSubscriptions) that can change as more
// transactions arrive — persisting an inference alongside its own source
// data means keeping the two in sync on every write. Recomputing over the
// `transactions` table (already small and normalized, unlike raw SMS) is
// cheap; if that stops being true at scale, revisit then, not now. (Issue
// #17 originally listed subscriptions as persisted — this deviation is the
// correction, tracked back on that issue.)
