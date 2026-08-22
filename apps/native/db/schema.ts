// On-device SQLite schema (local-first — see GitHub issue #17). Deliberately
// separate from packages/db/src/schema/transactions.ts: that schema is
// Postgres-specific, FK'd to an authenticated server user, and stores raw
// SMS server-side — none of that shape belongs on-device. A future sync
// layer maps rows between the two; it does not require either to change.
import { sqliteTable, text, real, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

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
    // Deterministic id: the Android content-provider `_id` when the caller
    // has one (RawSms.id from lib/sms.ts), otherwise a `sender|date|body`
    // fingerprint. Either way, re-ingesting the same message is a no-op
    // upsert, not a duplicate row — this is what makes ingestSmsBatch safe
    // to call from refresh, backfill, and background catch-up alike.
    id: text("id").primaryKey(),
    providerId: text("provider_id"),
    sender: text("sender").notNull(),
    body: text("body").notNull(),
    date: integer("date").notNull(), // epoch ms, matches RawSms.date
    parserVersion: text("parser_version").notNull(),
    // JSON.stringify(MalanaResult). Kept as opaque JSON rather than a wide
    // flat table — MalanaResult has 50+ category-specific optional fields
    // (travel/delivery/bill/OTP/...) and nothing outside the ledger needs to
    // query most of them directly; the normalized tables below cover what
    // the dashboard actually reads.
    parsedResult: text("parsed_result").notNull(),
    ingestionStatus: text("ingestion_status", { enum: ["parsed", "error"] }).notNull(),
    ingestionError: text("ingestion_error"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("sms_ledger_date_idx").on(table.date),
    index("sms_ledger_provider_id_idx").on(table.providerId),
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
  balance: real("balance").notNull(),
  balanceAsOf: integer("balance_as_of").notNull(),
  balanceSender: text("balance_sender").notNull(),
  estimatedBalance: real("estimated_balance").notNull(),
  estimatedAsOf: integer("estimated_as_of").notNull(),
  reconciliationDelta: real("reconciliation_delta"),
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
    balance: real("balance").notNull(),
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
    reconciliationExpectedBalance: real("reconciliation_expected_balance"),
    reconciliationDelta: real("reconciliation_delta"),
    capturedIncome: real("captured_income"),
    capturedExpense: real("captured_expense"),
    capturedTransactionCount: integer("captured_transaction_count"),
  },
  (table) => [
    index("balance_readings_account_id_idx").on(table.accountId),
    index("balance_readings_as_of_idx").on(table.asOf),
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
    amount: real("amount").notNull(),
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
  ],
);

// Autopay/mandate lifecycle — event-sourced from SMS the same way
// transactions are, not inferred, so it's persisted rather than
// recomputed (contrast with subscriptions below).
export const mandates = sqliteTable("mandates", {
  mandateId: text("mandate_id").primaryKey(),
  merchant: text("merchant").notNull(),
  amount: real("amount"),
  currency: text("currency").notNull(),
  status: text("status", { enum: ["active", "cancelled"] }).notNull(),
  createdAt: integer("created_at").notNull(),
  lastUpdated: integer("last_updated").notNull(),
  sender: text("sender").notNull(),
});

export const mandateEvents = sqliteTable(
  "mandate_events",
  {
    id: text("id").primaryKey(), // `${mandateId}|${date}|${sender}`
    mandateId: text("mandate_id")
      .notNull()
      .references(() => mandates.mandateId, { onDelete: "cascade" }),
    status: text("status", { enum: ["active", "cancelled"] }).notNull(),
    date: integer("date").notNull(),
    sender: text("sender").notNull(),
  },
  (table) => [index("mandate_events_mandate_id_idx").on(table.mandateId)],
);

// Subscriptions are deliberately NOT a table here. They're a heuristic
// inference (subscriptions.ts's deriveSubscriptions) that can change as more
// transactions arrive — persisting an inference alongside its own source
// data means keeping the two in sync on every write. Recomputing over the
// `transactions` table (already small and normalized, unlike raw SMS) is
// cheap; if that stops being true at scale, revisit then, not now.
