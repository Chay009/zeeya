import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

import { initializeNativeDatabase } from "./native-init";
import type { AsyncQueryClient } from "./queries";
import * as schema from "./schema";

vi.mock("./client", () => ({ db: null, sqlite: null }));

const { queryHomeHighlightsUnsafe } = await import("./queries-home-highlights");
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

describe("queryHomeHighlightsUnsafe", () => {
  let sqlite: Database.Database | null = null;
  afterEach(() => sqlite?.close());

  it("returns today's bounded activity and honest recurring/upcoming summaries", async () => {
    const fresh = freshDb();
    sqlite = fresh.sqlite;
    const db = fresh.db;
    const at = new Date(2026, 8, 10, 12).getTime();

    function transaction(input: {
      id: string;
      date: number;
      amount: number;
      direction: "income" | "expense" | "neutral";
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
          direction: input.direction,
          category: input.direction === "income" ? "Income" : "Shopping",
          brandName: input.merchant ?? null,
          subscriptionIdentityKey: input.merchant ? `${input.merchant.toLowerCase()}|INR` : null,
        })
        .run();
    }

    transaction({
      id: "today-shop",
      date: new Date(2026, 8, 10, 9).getTime(),
      amount: 1_200,
      direction: "expense",
      merchant: "Shop",
    });
    transaction({
      id: "today-netflix",
      date: new Date(2026, 8, 10, 10).getTime(),
      amount: 500,
      direction: "expense",
      merchant: "Netflix",
    });
    transaction({
      id: "today-income",
      date: new Date(2026, 8, 10, 11).getTime(),
      amount: 2_000,
      direction: "income",
    });
    transaction({
      id: "today-neutral",
      date: new Date(2026, 8, 10, 11, 30).getTime(),
      amount: 100,
      direction: "neutral",
    });
    transaction({
      id: "later-today-netflix",
      date: new Date(2026, 8, 10, 13).getTime(),
      amount: 500,
      direction: "expense",
      merchant: "Netflix",
    });
    transaction({
      id: "outside-subscription-tolerance",
      date: new Date(2026, 8, 2, 11).getTime(),
      amount: 10_000,
      direction: "expense",
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
          lastDate: new Date(2026, 8, 3, 10).getTime(),
          confidence: "likely",
        },
        {
          id: "music|INR",
          merchant: "Music",
          amountMinorUnits: 300,
          currency: "INR",
          count: 2,
          lastDate: new Date(2026, 8, 5, 10).getTime(),
          confidence: "possible",
        },
      ])
      .run();

    const result = await queryHomeHighlightsUnsafe(
      { currency: "INR", at, recentLimit: 3, upcomingLimit: 2 },
      asyncClient(fresh.sqlite),
    );

    expect(result.today).toMatchObject({
      incomeMinorUnits: 2_000,
      spendingMinorUnits: 1_700,
      netMinorUnits: 300,
      transactionCount: 3,
    });
    expect(result.today.recent.map((item) => item.id)).toEqual([
      "today-income",
      "today-netflix",
      "today-shop",
    ]);
    expect(result.today.largestTransaction?.id).toBe("today-income");
    expect(result.subscriptions).toMatchObject({
      activeCount: 2,
      likelyCount: 1,
      expectedMonthlyMinorUnits: 500,
      spentThisMonthMinorUnits: 500,
    });
    expect(result.upcomingPaymentCount).toBe(2);
    expect(result.upcomingPaymentsTotalMinorUnits).toBe(800);
    expect(result.upcomingPayments.map((item) => item.id)).toEqual(["netflix|INR", "music|INR"]);
    expect(result.upcomingPayments.every((item) => item.estimated)).toBe(true);
  });

  it("returns explicit empty-state values when the selected currency has no data", async () => {
    const fresh = freshDb();
    sqlite = fresh.sqlite;

    const result = await queryHomeHighlightsUnsafe(
      { currency: "USD", at: new Date(2026, 8, 10, 12).getTime() },
      asyncClient(fresh.sqlite),
    );

    expect(result).toEqual({
      currency: "USD",
      today: {
        incomeMinorUnits: 0,
        spendingMinorUnits: 0,
        netMinorUnits: 0,
        transactionCount: 0,
        recent: [],
        largestTransaction: null,
      },
      subscriptions: {
        activeCount: 0,
        likelyCount: 0,
        expectedMonthlyMinorUnits: 0,
        spentThisMonthMinorUnits: 0,
        nextPayment: null,
      },
      upcomingPaymentCount: 0,
      upcomingPaymentsTotalMinorUnits: 0,
      upcomingPayments: [],
    });
  });

  it("uses the measured non-monthly cadence for the upcoming payment", async () => {
    const fresh = freshDb();
    sqlite = fresh.sqlite;
    const db = fresh.db;
    const at = new Date(2026, 6, 1, 12).getTime();
    const dates = [new Date(2026, 4, 1, 9).getTime(), new Date(2026, 5, 15, 9).getTime()];

    for (const [index, date] of dates.entries()) {
      db.insert(schema.smsLedger)
        .values({
          id: `home-cadence-${index}`,
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
          id: `home-cadence-${index}`,
          smsId: `home-cadence-${index}`,
          date,
          amountMinorUnits: 1_000,
          currency: "INR",
          direction: "expense",
          category: "Services",
          brandName: "Delivery",
          subscriptionIdentityKey: "delivery|INR",
        })
        .run();
    }
    db.insert(schema.subscriptions)
      .values({
        id: "delivery|INR",
        merchant: "Delivery",
        amountMinorUnits: 1_000,
        currency: "INR",
        count: 2,
        lastDate: dates[1]!,
        confidence: "possible",
      })
      .run();

    const result = await queryHomeHighlightsUnsafe(
      { currency: "INR", at, upcomingLimit: 1 },
      asyncClient(fresh.sqlite),
    );

    expect(result.upcomingPaymentCount).toBe(1);
    expect(result.upcomingPayments[0]?.expectedAt).toBe(new Date(2026, 6, 30, 9).getTime());
  });

  it("keeps the full upcoming count separate from the capped preview list", async () => {
    const fresh = freshDb();
    sqlite = fresh.sqlite;
    const db = fresh.db;
    const at = new Date(2026, 8, 10, 12).getTime();

    for (const [id, merchant, day] of [
      ["alpha|INR", "Alpha", 1],
      ["beta|INR", "Beta", 2],
      ["gamma|INR", "Gamma", 3],
    ] as const) {
      const date = new Date(2026, 8, day, 10).getTime();
      db.insert(schema.subscriptions)
        .values({
          id,
          merchant,
          amountMinorUnits: 100,
          currency: "INR",
          count: 3,
          lastDate: date,
          confidence: "likely",
        })
        .run();
    }

    const result = await queryHomeHighlightsUnsafe(
      { currency: "INR", at, upcomingLimit: 2 },
      asyncClient(fresh.sqlite),
    );

    expect(result.upcomingPaymentCount).toBe(3);
    expect(result.upcomingPayments).toHaveLength(2);
  });

  it("rejects invalid timestamps and limits before issuing SQL", async () => {
    const client = { getAllAsync: vi.fn(async () => []) } as unknown as AsyncQueryClient;

    await expect(
      queryHomeHighlightsUnsafe({ currency: "INR", at: Number.NaN }, client),
    ).rejects.toThrow("at must be a valid timestamp");
    await expect(
      queryHomeHighlightsUnsafe({ currency: "INR", at: 0, recentLimit: 0 }, client),
    ).rejects.toThrow("recentLimit must be an integer between 1 and 20");
    await expect(
      queryHomeHighlightsUnsafe({ currency: "INR", at: 0, upcomingLimit: 21 }, client),
    ).rejects.toThrow("upcomingLimit must be an integer between 1 and 20");
    expect(client.getAllAsync).not.toHaveBeenCalled();
  });
});
