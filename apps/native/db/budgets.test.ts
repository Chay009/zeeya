import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

import { initializeNativeDatabase } from "./native-init";
import * as schema from "./schema";
import { asyncSqlite } from "./testing/async-sqlite";

let rawSqlite: Database.Database | null = null;
let testDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

vi.mock("./client", () => ({
  get db() {
    return testDb;
  },
  get sqlite() {
    return rawSqlite ? asyncSqlite(rawSqlite) : null;
  },
}));
const notifyDataChanged = vi.fn();
vi.mock("./data-changes", () => ({ notifyDataChanged }));

const { queryBudgetOverviewUnsafe, saveCategoryBudget } = await import("./budgets");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

function freshDb() {
  const sqlite = new Database(":memory:");
  initializeNativeDatabase({ execSync: (source: string) => sqlite.exec(source) });
  for (const file of readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort()) {
    for (const statement of readFileSync(path.join(MIGRATIONS_DIR, file), "utf8").split(
      "--> statement-breakpoint",
    )) {
      if (statement.trim()) sqlite.exec(statement);
    }
  }
  rawSqlite = sqlite;
  testDb = drizzle(sqlite, { schema });
  return testDb;
}

afterEach(() => {
  rawSqlite?.close();
  rawSqlite = null;
  testDb = null;
  notifyDataChanged.mockClear();
});

function spend(id: string, date: Date, amount: number, category: string, currency = "INR") {
  const db = testDb!;
  db.insert(schema.smsLedger)
    .values({
      id,
      sender: "BANK",
      body: "message",
      date: date.getTime(),
      parserVersion: "test",
      parsedResult: "{}",
      ingestionStatus: "parsed",
      createdAt: date.getTime(),
    })
    .run();
  db.insert(schema.transactions)
    .values({
      id,
      smsId: id,
      date: date.getTime(),
      amountMinorUnits: amount,
      currency,
      direction: "expense",
      category,
    })
    .run();
}

const AT = new Date(2026, 8, 15, 12).getTime(); // 15 Sep 2026

describe("category budgets", () => {
  it("reads each budget against this month's spend in its category and currency", async () => {
    freshDb();
    spend("sep-food-1", new Date(2026, 8, 2), 30_000, "Food");
    spend("sep-food-2", new Date(2026, 8, 10), 20_000, "Food");
    spend("aug-food", new Date(2026, 7, 20), 99_000, "Food"); // last month: not this month
    spend("sep-food-usd", new Date(2026, 8, 3), 5_000, "Food", "USD"); // other currency
    await saveCategoryBudget({ category: "Food", currency: "INR", monthlyLimitMinorUnits: 80_000 });
    await saveCategoryBudget({ category: "Travel", currency: "INR", monthlyLimitMinorUnits: 50_000 });

    const overview = await queryBudgetOverviewUnsafe({ currency: "INR", at: AT });

    expect(overview.budgets).toEqual([
      { category: "Food", limitMinorUnits: 80_000, spentMinorUnits: 50_000 },
      { category: "Travel", limitMinorUnits: 50_000, spentMinorUnits: 0 },
    ]);
    expect(overview.monthStart).toBe(new Date(2026, 8, 1).getTime());
    expect(overview.monthEnd).toBe(new Date(2026, 9, 1).getTime());
    expect(notifyDataChanged).toHaveBeenCalledTimes(2);
  });

  it("suggests from the average over the months that actually have spending", async () => {
    freshDb();
    // Only two of the last three months have data (a newer install).
    spend("jul-food", new Date(2026, 6, 5), 40_000, "Food");
    spend("aug-food", new Date(2026, 7, 5), 60_000, "Food");
    spend("aug-fuel", new Date(2026, 7, 6), 10_000, "Fuel");
    spend("sep-food", new Date(2026, 8, 5), 7_000, "Food");
    spend("may-food", new Date(2026, 4, 5), 900_000, "Food"); // outside the window

    const overview = await queryBudgetOverviewUnsafe({ currency: "INR", at: AT });

    expect(overview.categories).toEqual([
      { category: "Food", thisMonthMinorUnits: 7_000, averageMonthlyMinorUnits: 50_000 },
      { category: "Fuel", thisMonthMinorUnits: 0, averageMonthlyMinorUnits: 5_000 },
    ]);
  });

  it("updates a limit in place and removes it with null", async () => {
    freshDb();
    await saveCategoryBudget({ category: "Food", currency: "INR", monthlyLimitMinorUnits: 80_000 });
    await saveCategoryBudget({ category: "Food", currency: "INR", monthlyLimitMinorUnits: 90_000 });
    expect((await queryBudgetOverviewUnsafe({ currency: "INR", at: AT })).budgets).toEqual([
      { category: "Food", limitMinorUnits: 90_000, spentMinorUnits: 0 },
    ]);

    await saveCategoryBudget({ category: "Food", currency: "INR", monthlyLimitMinorUnits: null });
    expect((await queryBudgetOverviewUnsafe({ currency: "INR", at: AT })).budgets).toEqual([]);
  });

  it("rejects a blank category or a non-positive / fractional limit", async () => {
    freshDb();
    await expect(
      saveCategoryBudget({ category: " ", currency: "INR", monthlyLimitMinorUnits: 100 }),
    ).rejects.toThrow("category");
    await expect(
      saveCategoryBudget({ category: "Food", currency: "INR", monthlyLimitMinorUnits: 0 }),
    ).rejects.toThrow("positive");
    await expect(
      saveCategoryBudget({ category: "Food", currency: "INR", monthlyLimitMinorUnits: 1.5 }),
    ).rejects.toThrow("positive");
  });
});
