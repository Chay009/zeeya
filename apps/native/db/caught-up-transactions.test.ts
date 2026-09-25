import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ db: null }));

import {
  acknowledgeCaughtUpTransactions,
  queryCaughtUpTransactionsUnsafe,
} from "./caught-up-transactions";
import * as schema from "./schema";

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

function migratedDb() {
  const sqlite = new Database(":memory:");
  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    for (const statement of readFileSync(path.join(MIGRATIONS_DIR, file), "utf8").split(
      "--> statement-breakpoint",
    )) {
      if (statement.trim()) sqlite.exec(statement);
    }
  }
  return drizzle(sqlite, { schema });
}

describe("caught-up transactions", () => {
  let db: ReturnType<typeof migratedDb>;

  beforeEach(() => {
    db = migratedDb();
    db.insert(schema.localSettings).values({ id: "default", updatedAt: 1 }).run();
  });

  function insertArrival(id: string, sequence: number, financial: boolean) {
    db.insert(schema.smsLedger)
      .values({
        id,
        sender: "BANK",
        body: "message",
        date: sequence * 1000,
        parserVersion: "test",
        parsedResult: "{}",
        ingestionStatus: "parsed",
        createdAt: sequence,
      })
      .run();
    db.insert(schema.smsArrivals).values({ sequence, smsId: id }).run();
    if (financial) {
      db.insert(schema.transactions)
        .values({
          id,
          smsId: id,
          amountMinorUnits: sequence * 100,
          currency: "INR",
          direction: "expense",
          category: "Transaction",
          date: sequence * 1000,
          brandName: `Merchant ${sequence}`,
        })
        .run();
    }
  }

  it("returns only financial arrivals after the durable cursor and acknowledges them", async () => {
    insertArrival("old", 1, true);
    await acknowledgeCaughtUpTransactions(1, db);
    insertArrival("non-financial", 2, false);
    insertArrival("new", 3, true);

    const batch = queryCaughtUpTransactionsUnsafe({ limit: 8 }, db);

    expect(batch.total).toBe(1);
    expect(batch.throughSequence).toBe(3);
    expect(batch.items.map((item) => item.id)).toEqual(["new"]);

    await acknowledgeCaughtUpTransactions(batch.throughSequence, db);
    expect(queryCaughtUpTransactionsUnsafe({ limit: 8 }, db)).toEqual({
      items: [],
      total: 0,
      throughSequence: 3,
    });
  });

  it("keeps the preview bounded while reporting the complete unseen count", async () => {
    for (let sequence = 1; sequence <= 12; sequence++) {
      insertArrival(`sms-${sequence}`, sequence, true);
    }

    const batch = queryCaughtUpTransactionsUnsafe({ limit: 8 }, db);

    expect(batch.total).toBe(12);
    expect(batch.items).toHaveLength(8);
    expect(batch.items[0]?.id).toBe("sms-12");
    expect(batch.throughSequence).toBe(12);
  });
});
