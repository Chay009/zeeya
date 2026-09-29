import { count, desc, eq, gt, max, sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

import type { TransactionSummary } from "../lib/dashboard-data";
import { db, sqlite } from "./client";
import type { AsyncQueryClient } from "./queries";
import { readConsistentSnapshot } from "./projection-snapshot";
import { localSettings, smsArrivals, transactions } from "./schema";
import type * as schema from "./schema";

type SyncDatabase = BaseSQLiteDatabase<"sync", unknown, typeof schema>;

export interface CaughtUpTransactionBatch {
  items: TransactionSummary[];
  total: number;
  throughSequence: number;
}

function requireDb(): SyncDatabase {
  if (!db) throw new Error("Caught-up transactions are unavailable on this platform.");
  return db;
}

export function queryCaughtUpTransactionsUnsafe(
  query: { limit?: number } = {},
  database: SyncDatabase = requireDb(),
): CaughtUpTransactionBatch {
  const limit = query.limit ?? 8;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error(`limit must be an integer between 1 and 100, got ${limit}`);
  }

  const state = database
    .select({ cursor: localSettings.lastSeenArrivalSequence })
    .from(localSettings)
    .where(eq(localSettings.id, "default"))
    .get();
  const cursor = state?.cursor ?? 0;
  const throughSequence =
    database
      .select({ value: max(smsArrivals.sequence) })
      .from(smsArrivals)
      .get()?.value ?? cursor;

  const base = database
    .select({ value: count() })
    .from(smsArrivals)
    .innerJoin(transactions, eq(transactions.smsId, smsArrivals.smsId))
    .where(gt(smsArrivals.sequence, cursor))
    .get();

  const items = database
    .select({
      id: transactions.id,
      date: transactions.date,
      amountMinorUnits: transactions.amountMinorUnits,
      currency: transactions.currency,
      direction: transactions.direction,
      accountId: transactions.accountId,
      trxTypeRich: transactions.trxTypeRich,
      vendor: transactions.vendor,
      brandName: transactions.brandName,
      category: transactions.category,
      ref: transactions.ref,
      bankName: transactions.bankName,
      mandateId: transactions.mandateId,
    })
    .from(smsArrivals)
    .innerJoin(transactions, eq(transactions.smsId, smsArrivals.smsId))
    .where(gt(smsArrivals.sequence, cursor))
    .orderBy(desc(smsArrivals.sequence))
    .limit(limit)
    .all();

  return { items, total: base?.value ?? 0, throughSequence };
}

export function queryCaughtUpTransactions(
  query: { limit?: number } = {},
): Promise<CaughtUpTransactionBatch> {
  const database = requireDb();
  return readConsistentSnapshot(async () => queryCaughtUpTransactionsUnsafe(query, database));
}

// ── Arrival-sequence helpers for "what did this sync bring in?" ─────────
//
// sms_arrivals is an append-only, monotonic record of when THIS install
// ingested each SMS (independent of the SMS's own date). Reading the head
// before a sync and counting transactions that arrived after it answers
// "how many new transactions did that sync add" with two indexed reads —
// no need to derive the whole dashboard twice and diff it.

function requireSqlite(): AsyncQueryClient {
  if (!sqlite) throw new Error("Arrival tracking is unavailable on this platform.");
  return sqlite;
}

/** The newest arrival sequence (0 when nothing has ever been ingested). */
export async function latestArrivalSequence(): Promise<number> {
  const rows = await requireSqlite().getAllAsync<{ value: number | null }>(
    `SELECT MAX(sequence) AS value FROM sms_arrivals`,
    [],
  );
  return rows[0]?.value ?? 0;
}

/** Projected transactions whose SMS arrived after `sequence`. */
export async function countTransactionsArrivedAfter(sequence: number): Promise<number> {
  const rows = await requireSqlite().getAllAsync<{ value: number }>(
    `SELECT COUNT(*) AS value
     FROM sms_arrivals a
     INNER JOIN transactions t ON t.sms_id = a.sms_id
     WHERE a.sequence > ?`,
    [sequence],
  );
  return rows[0]?.value ?? 0;
}

// Marks every arrival so far as seen. Called once, when the first-ever
// historical import finishes: that import is the user's existing history,
// not "new since you last looked" — without this, a fresh install opened
// Home to a dialog listing the whole 90-day import as new transactions.
export async function acknowledgeAllArrivals(database: SyncDatabase = requireDb()): Promise<void> {
  const latest =
    database.select({ value: max(smsArrivals.sequence) }).from(smsArrivals).get()?.value ?? 0;
  if (latest > 0) await acknowledgeCaughtUpTransactions(latest, database);
}

export async function acknowledgeCaughtUpTransactions(
  throughSequence: number,
  database: SyncDatabase = requireDb(),
): Promise<void> {
  if (!Number.isSafeInteger(throughSequence) || throughSequence < 0) {
    throw new Error(`throughSequence must be a non-negative safe integer, got ${throughSequence}`);
  }
  database
    .insert(localSettings)
    .values({ id: "default", lastSeenArrivalSequence: throughSequence, updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: localSettings.id,
      set: {
        lastSeenArrivalSequence: sql`MAX(${localSettings.lastSeenArrivalSequence}, ${throughSequence})`,
        updatedAt: Date.now(),
      },
    })
    .run();
}
