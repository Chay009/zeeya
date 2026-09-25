import { count, desc, eq, gt, max, sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

import type { TransactionSummary } from "../lib/dashboard-data";
import { db } from "./client";
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
