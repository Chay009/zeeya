import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

import { initializeNativeDatabase } from "./native-init";
import type { AsyncQueryClient } from "./queries";
import * as schema from "./schema";

vi.mock("./client", () => ({ db: null, sqlite: null }));

const { queryInsightsOverviewUnsafe } = await import("./queries-insights-overview");
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

function freshDb() {
  const sqlite = new Database(":memory:");
  initializeNativeDatabase({ execSync: (source: string) => sqlite.exec(source) });
  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    for (const statement of readFileSync(path.join(MIGRATIONS_DIR, file), "utf8").split(
      "--> statement-breakpoint",
    )) {
      if (statement.trim()) sqlite.exec(statement);
    }
  }
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

function asyncClient(sqlite: Database.Database): AsyncQueryClient {
  return {
    async getAllAsync<T>(source: string, params: unknown[]): Promise<T[]> {
      return sqlite.prepare(source).all(...params) as T[];
    },
  };
}

describe("queryInsightsOverviewUnsafe", () => {
  let sqlite: Database.Database | null = null;

  afterEach(() => sqlite?.close());

  it("compares months and ranks categories, vendors, subscriptions, and budget history", async () => {
    const fresh = freshDb();
    sqlite = fresh.sqlite;
    const db = fresh.db;
    const at = new Date(2026, 8, 10, 12).getTime();

    function transaction(input: {
      id: string;
      date: number;
      amount: number;
      direction?: "income" | "expense" | "neutral";
      category: string;
      merchant?: string;
    }) {
      db.insert(schema.smsLedger)
        .values({
          id: input.id,
          sender: "BANK",
          body: "message",
          date: input.date,
          parserVersion: "test",
          parsedResult: "{}",
          ingestionStatus: "parsed",
          createdAt: input.date,
        })
        .run();
      db.insert(schema.transactions)
        .values({
          id: input.id,
          smsId: input.id,
          date: input.date,
          amountMinorUnits: input.amount,
          currency: "INR",
          direction: input.direction ?? "expense",
          category: input.category,
          brandName: input.merchant ?? null,
          subscriptionIdentityKey: input.merchant ? `${input.merchant.toLowerCase()}|INR` : null,
        })
        .run();
    }

    transaction({
      id: "sep-grocery",
      date: new Date(2026, 8, 2, 10).getTime(),
      amount: 1_200,
      category: "Groceries",
      merchant: "Market",
    });
    transaction({
      id: "sep-netflix",
      date: new Date(2026, 8, 3, 10).getTime(),
      amount: 500,
      category: "Entertainment",
      merchant: "Netflix",
    });
    transaction({
      id: "sep-income",
      date: new Date(2026, 8, 4, 10).getTime(),
      amount: 5_000,
      direction: "income",
      category: "Income",
    });
    transaction({
      id: "future-sep-grocery",
      date: new Date(2026, 8, 20, 10).getTime(),
      amount: 99_000,
      category: "Groceries",
      merchant: "Market",
    });
    transaction({
      id: "aug-grocery",
      date: new Date(2026, 7, 2, 10).getTime(),
      amount: 2_000,
      category: "Groceries",
      merchant: "Market",
    });
    transaction({
      id: "aug-netflix",
      date: new Date(2026, 7, 3, 10).getTime(),
      amount: 400,
      category: "Entertainment",
      merchant: "Netflix",
    });

    db.insert(schema.subscriptions)
      .values([
        {
          id: "netflix|INR",
          merchant: "Netflix",
          amountMinorUnits: 500,
          currency: "INR",
          count: 4,
          lastDate: new Date(2026, 8, 3).getTime(),
          confidence: "likely",
        },
        {
          id: "music|INR",
          merchant: "Music",
          amountMinorUnits: 300,
          currency: "INR",
          count: 2,
          lastDate: new Date(2026, 8, 5).getTime(),
          confidence: "possible",
        },
      ])
      .run();

    const result = await queryInsightsOverviewUnsafe(
      { currency: "INR", at, dailyBudgetMinorUnits: 1_000, historyMonths: 2, limit: 5 },
      asyncClient(fresh.sqlite),
    );

    expect(result.currentMonth).toEqual({
      incomeMinorUnits: 5_000,
      spendingMinorUnits: 1_700,
      netMinorUnits: 3_300,
      transactionCount: 3,
    });
    expect(result.previousMonth.spendingMinorUnits).toBe(2_400);
    expect(result.spendingChangePercent).toBe(-29);
    expect(result.topCategories).toEqual([
      {
        category: "Groceries",
        currentMinorUnits: 1_200,
        previousMinorUnits: 2_000,
        deltaMinorUnits: -800,
        changePercent: -40,
      },
      {
        category: "Entertainment",
        currentMinorUnits: 500,
        previousMinorUnits: 400,
        deltaMinorUnits: 100,
        changePercent: 25,
      },
    ]);
    expect(result.topVendors[0]).toMatchObject({
      vendor: "Market",
      currentMinorUnits: 1_200,
      previousMinorUnits: 2_000,
      transactionCount: 1,
    });
    expect(result.subscriptions).toMatchObject({
      activeCount: 2,
      likelyCount: 1,
      monthlyCommittedMinorUnits: 500,
    });
    expect(result.subscriptions.top.map((item) => item.merchant)).toEqual(["Netflix", "Music"]);
    expect(result.budget?.adherenceScore).toBe(90);
    // A credit with no named payer is filed under its income category.
    expect(result.topIncomeSources).toEqual([
      {
        source: "Income",
        currentMinorUnits: 5_000,
        previousMinorUnits: 0,
        deltaMinorUnits: 5_000,
        changePercent: null,
        transactionCount: 1,
      },
    ]);
    expect(result.largestCredit).toEqual({
      source: "Income",
      amountMinorUnits: 5_000,
      date: new Date(2026, 8, 4, 10).getTime(),
    });
  });

  it("returns honest zero/null comparisons when the selected currency has no history", async () => {
    const fresh = freshDb();
    sqlite = fresh.sqlite;

    const result = await queryInsightsOverviewUnsafe(
      { currency: "USD", at: new Date(2026, 8, 10, 12).getTime() },
      asyncClient(fresh.sqlite),
    );

    expect(result.currentMonth).toEqual({
      incomeMinorUnits: 0,
      spendingMinorUnits: 0,
      netMinorUnits: 0,
      transactionCount: 0,
    });
    expect(result.previousMonth).toEqual(result.currentMonth);
    expect(result.spendingChangePercent).toBeNull();
    expect(result.topCategories).toEqual([]);
    expect(result.topVendors).toEqual([]);
    expect(result.subscriptions).toEqual({
      activeCount: 0,
      likelyCount: 0,
      monthlyCommittedMinorUnits: 0,
      top: [],
    });
    expect(result.budget).toBeNull();
  });

  // Early in a month, a whole-month baseline would read as a huge drop.
  it("compares this month so far with last month up to the same point", async () => {
    const fresh = freshDb();
    sqlite = fresh.sqlite;
    const db = fresh.db;
    const insert = (id: string, date: number, amount: number) => {
      db.insert(schema.smsLedger)
        .values({
          id,
          sender: "BANK",
          body: "message",
          date,
          parserVersion: "test",
          parsedResult: "{}",
          ingestionStatus: "parsed",
          createdAt: date,
        })
        .run();
      db.insert(schema.transactions)
        .values({
          id,
          smsId: id,
          date,
          amountMinorUnits: amount,
          currency: "INR",
          direction: "expense",
          category: "Food",
          brandName: null,
          subscriptionIdentityKey: null,
        })
        .run();
    };
    insert("now", new Date(2026, 8, 5, 9).getTime(), 1_000);
    insert("last-month-by-now", new Date(2026, 7, 4, 9).getTime(), 800);
    insert("last-month-later", new Date(2026, 7, 20, 9).getTime(), 50_000);

    const result = await queryInsightsOverviewUnsafe(
      { currency: "INR", at: new Date(2026, 8, 5, 12).getTime() },
      asyncClient(fresh.sqlite),
    );

    expect(result.previousMonth.spendingMinorUnits).toBe(800);
    expect(result.spendingChangePercent).toBe(25);
    expect(result.topCategories[0]).toMatchObject({
      currentMinorUnits: 1_000,
      previousMinorUnits: 800,
    });
  });

  it("honors an explicit bounded comparison period for six-month analytics", async () => {
    const fresh = freshDb();
    sqlite = fresh.sqlite;
    const db = fresh.db;
    const at = new Date(2026, 8, 10, 12).getTime();
    const insert = (id: string, date: number, amount: number) => {
      db.insert(schema.smsLedger)
        .values({
          id,
          sender: "BANK",
          body: "message",
          date,
          parserVersion: "test",
          parsedResult: "{}",
          ingestionStatus: "parsed",
          createdAt: date,
        })
        .run();
      db.insert(schema.transactions)
        .values({
          id,
          smsId: id,
          date,
          amountMinorUnits: amount,
          currency: "INR",
          direction: "expense",
          category: "Food",
          brandName: "Cafe",
          subscriptionIdentityKey: null,
        })
        .run();
    };
    insert("six-current", new Date(2026, 5, 5).getTime(), 600);
    insert("six-previous", new Date(2026, 2, 5).getTime(), 200);

    const result = await queryInsightsOverviewUnsafe(
      {
        currency: "INR",
        at,
        period: {
          currentFrom: new Date(2026, 3, 1).getTime(),
          currentTo: at,
          previousFrom: new Date(2025, 9, 1).getTime(),
          previousTo: new Date(2026, 2, 31, 23, 59, 59, 999).getTime(),
        },
      },
      asyncClient(fresh.sqlite),
    );

    expect(result.currentMonth.spendingMinorUnits).toBe(600);
    expect(result.previousMonth.spendingMinorUnits).toBe(200);
    expect(result.topCategories[0]).toMatchObject({
      currentMinorUnits: 600,
      previousMinorUnits: 200,
      changePercent: 200,
    });
  });

  it("rejects invalid timestamps and bounds before issuing SQL", async () => {
    const client = { getAllAsync: vi.fn(async () => []) } as unknown as AsyncQueryClient;

    await expect(
      queryInsightsOverviewUnsafe({ currency: "INR", at: Number.NaN }, client),
    ).rejects.toThrow("at must be a valid timestamp");
    await expect(
      queryInsightsOverviewUnsafe({ currency: "INR", at: 0, limit: 21 }, client),
    ).rejects.toThrow("limit must be an integer between 1 and 20");
    await expect(
      queryInsightsOverviewUnsafe({ currency: "INR", at: 0, historyMonths: 25 }, client),
    ).rejects.toThrow("historyMonths must be an integer between 1 and 24");
    expect(client.getAllAsync).not.toHaveBeenCalled();
  });
});
