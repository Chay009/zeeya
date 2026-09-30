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
vi.mock("./data-changes", () => ({ notifyDataChanged: vi.fn() }));

const { collectBudgetAlerts } = await import("./budget-alerts");
const { saveCategoryBudget } = await import("./budgets");

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
}

afterEach(() => {
  rawSqlite?.close();
  rawSqlite = null;
  testDb = null;
});

let nextId = 0;
function spend(date: Date, amount: number, category = "Food") {
  const id = `txn-${++nextId}`;
  testDb!
    .insert(schema.smsLedger)
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
  testDb!
    .insert(schema.transactions)
    .values({
      id,
      smsId: id,
      date: date.getTime(),
      amountMinorUnits: amount,
      currency: "INR",
      direction: "expense",
      category,
    })
    .run();
}

const SEP_10 = new Date(2026, 8, 10, 12).getTime();
const SEP_20 = new Date(2026, 8, 20, 12).getTime();

// saveCategoryBudget stamps its baseline with Date.now().
function atTime(ms: number) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(ms);
}

describe("budget alerts", () => {
  afterEach(() => vi.useRealTimers());

  it("alerts once at 85%, once when over, and never repeats a level in the month", async () => {
    freshDb();
    atTime(SEP_10);
    await saveCategoryBudget({ category: "Food", currency: "INR", monthlyLimitMinorUnits: 10_000 });

    spend(new Date(2026, 8, 11), 5_000);
    expect(collectBudgetAlerts(SEP_10)).toEqual([]);

    spend(new Date(2026, 8, 12), 3_600); // 86%
    expect(collectBudgetAlerts(SEP_10)).toEqual([{ category: "Food", currency: "INR", level: 85 }]);
    expect(collectBudgetAlerts(SEP_10)).toEqual([]); // already told

    spend(new Date(2026, 8, 13), 2_000); // 116%
    expect(collectBudgetAlerts(SEP_20)).toEqual([{ category: "Food", currency: "INR", level: 100 }]);
    expect(collectBudgetAlerts(SEP_20)).toEqual([]);
  });

  it("starts clean in a new month", async () => {
    freshDb();
    atTime(SEP_10);
    await saveCategoryBudget({ category: "Food", currency: "INR", monthlyLimitMinorUnits: 10_000 });
    spend(new Date(2026, 8, 12), 9_000);
    expect(collectBudgetAlerts(SEP_10)).toHaveLength(1);

    spend(new Date(2026, 9, 3), 9_000); // October
    expect(collectBudgetAlerts(new Date(2026, 9, 5).getTime())).toEqual([
      { category: "Food", currency: "INR", level: 85 },
    ]);
  });

  it("does not announce a budget that was already over when the user set it", async () => {
    freshDb();
    spend(new Date(2026, 8, 5), 12_000);
    atTime(SEP_10);
    await saveCategoryBudget({ category: "Food", currency: "INR", monthlyLimitMinorUnits: 10_000 });
    expect(collectBudgetAlerts(SEP_10)).toEqual([]);
  });

  it("alerts again after the user raises the limit and spending crosses it", async () => {
    freshDb();
    atTime(SEP_10);
    await saveCategoryBudget({ category: "Food", currency: "INR", monthlyLimitMinorUnits: 10_000 });
    spend(new Date(2026, 8, 11), 11_000);
    expect(collectBudgetAlerts(SEP_10)).toHaveLength(1);

    await saveCategoryBudget({ category: "Food", currency: "INR", monthlyLimitMinorUnits: 20_000 });
    expect(collectBudgetAlerts(SEP_10)).toEqual([]);
    spend(new Date(2026, 8, 12), 7_000); // 90% of the new limit
    expect(collectBudgetAlerts(SEP_10)).toEqual([{ category: "Food", currency: "INR", level: 85 }]);
  });

  it("forgets a removed budget", async () => {
    freshDb();
    atTime(SEP_10);
    await saveCategoryBudget({ category: "Food", currency: "INR", monthlyLimitMinorUnits: 10_000 });
    await saveCategoryBudget({ category: "Food", currency: "INR", monthlyLimitMinorUnits: null });
    spend(new Date(2026, 8, 11), 50_000);
    expect(collectBudgetAlerts(SEP_10)).toEqual([]);
    expect(rawSqlite!.prepare("SELECT COUNT(*) AS n FROM budget_alerts").get()).toEqual({ n: 0 });
  });
});
