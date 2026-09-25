// Parity tests: the whole point of db/queries.ts is that its SQL results
// must exactly match what lib/dashboard.ts's deriveDashboard() computes
// from the same ledger data in JS — that's the "correct" this rollout is
// gated on (see queries.ts's own rollout-status comment). Every test here
// seeds identical ParsedSms fixtures into both a real ledger+projection
// (via replaceProjection) and deriveDashboard() directly, then asserts
// the SQL query's output matches the JS-derived Dashboard's own totals.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, it, expect, vi } from "vitest";
import type { MalanaResult } from "@zeeya/parser/malana";
import { deriveDashboardProjection } from "../lib/dashboard";
import {
  buildMonthlySpendSeries,
  buildMonthlyIncomeSeries,
  buildSpendingSeries,
  buildIncomeSeries,
} from "../features/insights/insights-data";
import type { ParsedSms } from "../lib/sms";
import { fromMinorUnits } from "../lib/currency";
import { replaceProjection } from "./projections";
import type { AsyncQueryClient } from "./queries";
import * as schema from "./schema";
import { initializeNativeDatabase } from "./native-init";

// queries.ts imports `sqlite` from "./client" at module scope purely for
// its default-parameter fallback (defaultClient()) — every call in this
// suite passes its own AsyncQueryClient explicitly, so that fallback is
// never actually reached, but the module-level import still has to
// resolve. "./client" is db/client.native.ts in this Node test
// environment, which opens a real expo-sqlite connection at import time
// (same reason ingestion.test.ts mocks it) — mocked here for the same
// reason, not because these tests exercise the real client.
vi.mock("./client", () => ({ sqlite: null }));

const {
  queryCategoryTotals,
  queryDashboardAggregates,
  queryDailySeries,
  queryDistinctCurrencies,
  queryMonthlySeries,
  queryMonthTotals,
  queryTransactionsForDay,
  querySubscriptions,
  UNCATEGORIZED_TRANSACTION_LABEL,
} = await import("./queries");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

function freshDb() {
  const sqlite = new Database(":memory:");
  initializeNativeDatabase({ execSync: (source: string) => sqlite.exec(source) });
  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of migrationFiles) {
    const statements = readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8").split(
      "--> statement-breakpoint",
    );
    for (const statement of statements) {
      const trimmed = statement.trim();
      if (trimmed) sqlite.exec(trimmed);
    }
  }
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

// A minimal, synchronous-underneath adapter satisfying queries.ts's
// AsyncQueryClient — the real production client (expo-sqlite's
// SQLiteDatabase) is genuinely async, but for a parity test, wrapping
// better-sqlite3's sync .all() in a resolved Promise is a faithful
// enough stand-in: the SQL text and its result shape are what's under
// test here, not expo-sqlite's own async plumbing.
function asyncClientFor(sqlite: Database.Database): AsyncQueryClient {
  return {
    async getAllAsync<T>(source: string, params: unknown[]): Promise<T[]> {
      return sqlite.prepare(source).all(...params) as T[];
    },
  };
}

function result(overrides: Partial<MalanaResult>): MalanaResult {
  return {
    category: "GRM_BANK",
    tags: {},
    tokens: [],
    bankName: null,
    merchantCategory: null,
    subcategory: null,
    trx: null,
    bal: null,
    acc: null,
    trxType: null,
    trxTypeRich: null,
    currency: "INR",
    isFromCard: false,
    creditLimit: null,
    ref: null,
    bene: null,
    beneAcc: null,
    vendor: null,
    location: null,
    otp: null,
    otpExpiry: null,
    pnr: null,
    flight: null,
    departure: null,
    arrival: null,
    fare: null,
    trainBusNo: null,
    boardingGate: null,
    departureCode: null,
    arrivalCode: null,
    orderNo: null,
    trackingId: null,
    deliveryStatus: null,
    item: null,
    billAmount: null,
    emiAmount: null,
    dueDate: null,
    policyNo: null,
    rechargeAmount: null,
    mandateAmount: null,
    mandateId: null,
    mandateEvent: null,
    mandateMerchant: null,
    cashback: null,
    discount: null,
    offerCode: null,
    offerCategory: null,
    dataLeft: null,
    packBalance: null,
    navValue: null,
    folio: null,
    marginAmount: null,
    brandName: null,
    isOnlineBrand: false,
    upiHandle: null,
    isSpam: false,
    spamScore: 0,
    ...overrides,
  };
}

function sms(id: string, sender: string, date: number, r: Partial<MalanaResult>): ParsedSms {
  return { id, sender, body: "", date, result: result(r) };
}

function seedLedgerAndProject(
  db: ReturnType<typeof freshDb>["db"],
  messages: ParsedSms[],
  now: Date,
) {
  for (const message of messages) {
    db.insert(schema.smsLedger)
      .values({
        id: message.id,
        sender: message.sender,
        body: message.body,
        date: message.date,
        parserVersion: "test",
        parsedResult: JSON.stringify(message.result),
        ingestionStatus: "parsed",
        createdAt: message.date,
      })
      .run();
  }
  const projection = deriveDashboardProjection(messages, now);
  replaceProjection(db, projection);
  return projection.dashboard;
}

describe("queryMonthTotals parity with deriveDashboard", () => {
  it("matches monthIncomeByCurrency/monthExpenseByCurrency for a single-currency month", async () => {
    const { sqlite, db } = freshDb();
    const now = new Date(2026, 5, 15); // June 2026
    const messages: ParsedSms[] = [
      sms("expense-1", "VM-TEST", now.getTime(), {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "199.50",
        trxTypeRich: "EXPENSE",
      }),
      sms("income-1", "VM-TEST", now.getTime(), {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "50000.00",
        trxTypeRich: "SALARY",
      }),
    ];
    const dashboard = seedLedgerAndProject(db, messages, now);

    const sqlTotals = await queryMonthTotals(now, asyncClientFor(sqlite));

    expect(sqlTotals.expenseByCurrency).toEqual(dashboard.monthExpenseByCurrency);
    expect(sqlTotals.incomeByCurrency).toEqual(dashboard.monthIncomeByCurrency);
  });

  it("matches deriveDashboard when multiple currencies have activity in the same month", async () => {
    const { sqlite, db } = freshDb();
    const now = new Date(2026, 5, 15);
    const messages: ParsedSms[] = [
      sms("inr-expense", "VM-TEST", now.getTime(), {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "100.00",
        trxTypeRich: "EXPENSE",
        currency: "INR",
      }),
      sms("usd-expense", "VM-TEST", now.getTime(), {
        bankName: "Test Bank",
        acc: "XX5678",
        trx: "20.00",
        trxTypeRich: "EXPENSE",
        currency: "USD",
      }),
    ];
    const dashboard = seedLedgerAndProject(db, messages, now);

    const sqlTotals = await queryMonthTotals(now, asyncClientFor(sqlite));

    expect(sqlTotals.expenseByCurrency).toEqual(dashboard.monthExpenseByCurrency);
    expect(Object.keys(sqlTotals.expenseByCurrency).sort()).toEqual(["INR", "USD"]);
  });

  it("excludes transactions outside the given month from both the SQL query and deriveDashboard", async () => {
    const { sqlite, db } = freshDb();
    const now = new Date(2026, 5, 15);
    const lastMonth = new Date(2026, 4, 20).getTime();
    const messages: ParsedSms[] = [
      sms("this-month", "VM-TEST", now.getTime(), {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "100.00",
        trxTypeRich: "EXPENSE",
      }),
      sms("last-month", "VM-TEST", lastMonth, {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "999.00",
        trxTypeRich: "EXPENSE",
      }),
    ];
    const dashboard = seedLedgerAndProject(db, messages, now);

    const sqlTotals = await queryMonthTotals(now, asyncClientFor(sqlite));

    expect(sqlTotals.expenseByCurrency.INR).toBe(100);
    expect(dashboard.monthExpenseByCurrency.INR).toBe(100);
  });
});

describe("queryCategoryTotals parity with deriveDashboard's category-derived data", () => {
  it("sums expense transactions by merchant category for the given currency and month", async () => {
    const { sqlite, db } = freshDb();
    const now = new Date(2026, 5, 15);
    const messages: ParsedSms[] = [
      sms("food-1", "VM-TEST", now.getTime(), {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "50.00",
        trxTypeRich: "EXPENSE",
        merchantCategory: "Food",
      }),
      sms("food-2", "VM-TEST", now.getTime(), {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "25.00",
        trxTypeRich: "EXPENSE",
        merchantCategory: "Food",
      }),
      sms("travel-1", "VM-TEST", now.getTime(), {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "300.00",
        trxTypeRich: "EXPENSE",
        merchantCategory: "Travel",
      }),
    ];
    seedLedgerAndProject(db, messages, now);

    const categories = await queryCategoryTotals("INR", now, asyncClientFor(sqlite));
    const byCategory = Object.fromEntries(
      categories.map((c) => [c.category, c.totalMinorUnits / 100]),
    );

    expect(byCategory).toEqual({ Food: 75, Travel: 300 });
  });

  it("never mixes currencies into one category total", async () => {
    const { sqlite, db } = freshDb();
    const now = new Date(2026, 5, 15);
    const messages: ParsedSms[] = [
      sms("inr-food", "VM-TEST", now.getTime(), {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "100.00",
        trxTypeRich: "EXPENSE",
        merchantCategory: "Food",
        currency: "INR",
      }),
      sms("usd-food", "VM-TEST", now.getTime(), {
        bankName: "Test Bank",
        acc: "XX5678",
        trx: "10.00",
        trxTypeRich: "EXPENSE",
        merchantCategory: "Food",
        currency: "USD",
      }),
    ];
    seedLedgerAndProject(db, messages, now);

    const inrCategories = await queryCategoryTotals("INR", now, asyncClientFor(sqlite));
    expect(inrCategories).toHaveLength(1);
    expect(inrCategories[0]!.totalMinorUnits / 100).toBe(100);
  });

  it("falls back to subcategory when merchantCategory is absent, same as categoryName()'s own fallback", async () => {
    const { sqlite, db } = freshDb();
    const now = new Date(2026, 5, 15);
    const messages: ParsedSms[] = [
      sms("upi-1", "VM-TEST", now.getTime(), {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "40.00",
        trxTypeRich: "EXPENSE",
        merchantCategory: null,
        subcategory: "upi",
      }),
      sms("upi-2", "VM-TEST", now.getTime(), {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "60.00",
        trxTypeRich: "EXPENSE",
        merchantCategory: null,
        subcategory: "upi",
      }),
    ];
    seedLedgerAndProject(db, messages, now);

    const categories = await queryCategoryTotals("INR", now, asyncClientFor(sqlite));

    expect(categories).toHaveLength(1);
    expect(categories[0]!.category).toBe("Upi");
    expect(categories[0]!.totalMinorUnits / 100).toBe(100);
  });

  it("groups under the shared UNCATEGORIZED_TRANSACTION_LABEL when neither field is present", async () => {
    const { sqlite, db } = freshDb();
    const now = new Date(2026, 5, 15);
    const messages: ParsedSms[] = [
      sms("uncategorized-1", "VM-TEST", now.getTime(), {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "15.00",
        trxTypeRich: "EXPENSE",
        merchantCategory: null,
        subcategory: null,
      }),
    ];
    seedLedgerAndProject(db, messages, now);

    const categories = await queryCategoryTotals("INR", now, asyncClientFor(sqlite));

    expect(categories).toHaveLength(1);
    expect(categories[0]!.category).toBe(UNCATEGORIZED_TRANSACTION_LABEL);
  });

  it("prefers merchantCategory over subcategory when both are present, same order categoryName() checks them", async () => {
    const { sqlite, db } = freshDb();
    const now = new Date(2026, 5, 15);
    const messages: ParsedSms[] = [
      sms("both-present", "VM-TEST", now.getTime(), {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "20.00",
        trxTypeRich: "EXPENSE",
        merchantCategory: "Food",
        subcategory: "upi",
      }),
    ];
    seedLedgerAndProject(db, messages, now);

    const categories = await queryCategoryTotals("INR", now, asyncClientFor(sqlite));

    expect(categories).toHaveLength(1);
    expect(categories[0]!.category).toBe("Food");
  });
});

describe("queryDashboardAggregates", () => {
  it("combines month totals with per-currency category totals", async () => {
    const { sqlite, db } = freshDb();
    const now = new Date(2026, 5, 15);
    const messages: ParsedSms[] = [
      sms("aggregate-food", "VM-TEST", now.getTime(), {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "75.00",
        trxTypeRich: "EXPENSE",
        merchantCategory: "Food",
      }),
      sms("aggregate-usd", "VM-TEST", now.getTime(), {
        bankName: "Test Bank",
        acc: "XX5678",
        trx: "10.00",
        trxTypeRich: "EXPENSE",
        merchantCategory: "Travel",
        currency: "USD",
      }),
    ];
    const dashboard = seedLedgerAndProject(db, messages, now);

    const baseClient = asyncClientFor(sqlite);
    let queryCount = 0;
    const countingClient: AsyncQueryClient = {
      async getAllAsync<T>(
        source: string,
        params: (string | number | null | boolean | Uint8Array | ArrayBuffer)[],
      ): Promise<T[]> {
        queryCount++;
        return baseClient.getAllAsync<T>(source, params);
      },
    };
    const aggregates = await queryDashboardAggregates(["INR", "USD"], now, countingClient);

    expect(aggregates.monthTotals.expenseByCurrency).toEqual(dashboard.monthExpenseByCurrency);
    expect(aggregates.categoryTotalsByCurrency.INR).toEqual([
      { category: "Food", totalMinorUnits: 7500 },
    ]);
    expect(aggregates.categoryTotalsByCurrency.USD).toEqual([
      { category: "Travel", totalMinorUnits: 1000 },
    ]);
    expect(queryCount).toBe(1);
  });
});

describe("queryDistinctCurrencies", () => {
  it("lists every currency with a projected transaction, and nothing else", async () => {
    const { sqlite, db } = freshDb();
    const now = new Date(2026, 5, 15);
    const messages: ParsedSms[] = [
      sms("inr", "VM-TEST", now.getTime(), {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "10.00",
        trxTypeRich: "EXPENSE",
        currency: "INR",
      }),
      sms("usd", "VM-TEST", now.getTime(), {
        bankName: "Test Bank",
        acc: "XX5678",
        trx: "5.00",
        trxTypeRich: "EXPENSE",
        currency: "USD",
      }),
      // Duplicated currency must not produce a duplicate entry.
      sms("inr-2", "VM-TEST", now.getTime(), {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "20.00",
        trxTypeRich: "INCOME",
        currency: "INR",
      }),
    ];
    seedLedgerAndProject(db, messages, now);

    const currencies = await queryDistinctCurrencies(asyncClientFor(sqlite));

    expect([...currencies].sort()).toEqual(["INR", "USD"]);
  });

  it("includes an account-only INR currency in the primary-first list", async () => {
    const { sqlite, db } = freshDb();
    const now = new Date(2026, 5, 15).getTime();
    const messages: ParsedSms[] = [
      sms("inr-account-only", "VM-INR", now, {
        bankName: "INR Bank",
        acc: "XX1111",
        bal: "1000.00",
        currency: "INR",
      }),
      sms("usd-transaction", "VM-USD", now - 86_400_000, {
        trx: "5.00",
        trxTypeRich: "EXPENSE",
        currency: "USD",
      }),
    ];
    seedLedgerAndProject(db, messages, new Date(now));

    expect(await queryDistinctCurrencies(asyncClientFor(sqlite))).toEqual(["INR", "USD"]);
  });

  it("uses the most recently projected account currency when INR is absent", async () => {
    const { sqlite, db } = freshDb();
    const now = new Date(2026, 5, 15).getTime();
    const messages: ParsedSms[] = [
      sms("usd-balance", "VM-USD", now - 10 * 86_400_000, {
        bankName: "USD Bank",
        acc: "XX1111",
        bal: "1000.00",
        currency: "USD",
      }),
      sms("sek-balance", "VM-SEK", now, {
        bankName: "SEK Bank",
        acc: "XX2222",
        bal: "1000.00",
        currency: "SEK",
      }),
      sms("usd-transaction", "VM-USD", now - 2 * 86_400_000, {
        bankName: "USD Bank",
        acc: "XX1111",
        trx: "10.00",
        trxTypeRich: "EXPENSE",
        currency: "USD",
      }),
      sms("sek-transaction", "VM-SEK", now - 3 * 86_400_000, {
        bankName: "SEK Bank",
        acc: "XX2222",
        trx: "10.00",
        trxTypeRich: "EXPENSE",
        currency: "SEK",
      }),
    ];
    seedLedgerAndProject(db, messages, new Date(now));

    expect(await queryDistinctCurrencies(asyncClientFor(sqlite))).toEqual(["SEK", "USD"]);
  });

  it("keeps INR first whenever it is projected, even when another account is newer", async () => {
    const { sqlite, db } = freshDb();
    const now = new Date(2026, 5, 15).getTime();
    const messages: ParsedSms[] = [
      sms("inr-account", "VM-INR", now - 10 * 86_400_000, {
        bankName: "INR Bank",
        acc: "XX1111",
        bal: "1000.00",
        currency: "INR",
      }),
      // This account is newer. INR is still the product primary because it
      // is present in the projected currency set.
      sms("sek-account", "VM-SEK", now, {
        bankName: "SEK Bank",
        acc: "XX2222",
        bal: "1000.00",
        currency: "SEK",
      }),
      sms("inr-transaction", "VM-INR", now - 2 * 86_400_000, {
        bankName: "INR Bank",
        acc: "XX1111",
        trx: "5.00",
        trxTypeRich: "EXPENSE",
        currency: "INR",
      }),
      sms("sek-transaction", "VM-SEK", now - 86_400_000, {
        bankName: "SEK Bank",
        acc: "XX2222",
        trx: "5.00",
        trxTypeRich: "EXPENSE",
        currency: "SEK",
      }),
    ];
    seedLedgerAndProject(db, messages, new Date(now));

    expect(await queryDistinctCurrencies(asyncClientFor(sqlite))).toEqual(["INR", "SEK"]);
  });

  it("returns an empty list against an empty ledger", async () => {
    const { sqlite, db } = freshDb();
    seedLedgerAndProject(db, [], new Date(2026, 5, 15));

    const currencies = await queryDistinctCurrencies(asyncClientFor(sqlite));

    expect(currencies).toEqual([]);
  });
});

// Parity against features/insights/insights-data.ts's own JS series
// builders — the whole point of these queries is that a chart fed by SQL
// draws identically to one fed by the in-memory functions Insights used
// before this, not merely "a plausible-looking series."
describe("queryDailySeries parity with buildSpendingSeries/buildIncomeSeries", () => {
  it("matches a 31-day expense series spanning a month boundary", async () => {
    const { sqlite, db } = freshDb();
    const now = new Date(2026, 5, 15); // June 15, 2026
    const messages: ParsedSms[] = [
      // Within the 31-day window (back to May 16).
      sms("may-20", "VM-TEST", new Date(2026, 4, 20).getTime(), {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "40.00",
        trxTypeRich: "EXPENSE",
      }),
      sms("jun-01", "VM-TEST", new Date(2026, 5, 1).getTime(), {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "15.50",
        trxTypeRich: "EXPENSE",
      }),
      // Two transactions on the same day must sum into one bucket.
      sms("jun-15-a", "VM-TEST", now.getTime(), {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "5.00",
        trxTypeRich: "EXPENSE",
      }),
      sms("jun-15-b", "VM-TEST", now.getTime(), {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "7.25",
        trxTypeRich: "EXPENSE",
      }),
      // Before the 31-day window — must not appear in either series.
      sms("too-old", "VM-TEST", new Date(2026, 4, 1).getTime(), {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "999.00",
        trxTypeRich: "EXPENSE",
      }),
      // Income must not leak into the expense series.
      sms("jun-15-income", "VM-TEST", now.getTime(), {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "50000.00",
        trxTypeRich: "SALARY",
      }),
    ];
    const dashboard = seedLedgerAndProject(db, messages, now);

    const jsSeries = buildSpendingSeries(dashboard.recent, "INR", now, 31);
    const sqlSeries = await queryDailySeries("INR", "expense", now, 31, asyncClientFor(sqlite));

    expect(sqlSeries).toHaveLength(jsSeries.length);
    for (let i = 0; i < jsSeries.length; i++) {
      expect(sqlSeries[i]!.day).toBe(jsSeries[i]!.day);
      expect(fromMinorUnits(sqlSeries[i]!.totalMinorUnits, "INR")).toBeCloseTo(
        jsSeries[i]!.value,
        2,
      );
    }
  });

  it("matches a 14-day income series with an empty ledger", async () => {
    const { sqlite, db } = freshDb();
    const now = new Date(2026, 5, 15);
    const dashboard = seedLedgerAndProject(db, [], now);

    const jsSeries = buildIncomeSeries(dashboard.recent, "INR", now, 14);
    const sqlSeries = await queryDailySeries("INR", "income", now, 14, asyncClientFor(sqlite));

    expect(sqlSeries.every((point) => point.totalMinorUnits === 0)).toBe(true);
    expect(sqlSeries.map((point) => point.day)).toEqual(jsSeries.map((point) => point.day));
  });

  it("keeps a second currency's activity out of the requested currency's buckets", async () => {
    const { sqlite, db } = freshDb();
    const now = new Date(2026, 5, 15);
    const messages: ParsedSms[] = [
      sms("inr-expense", "VM-TEST", now.getTime(), {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "20.00",
        trxTypeRich: "EXPENSE",
        currency: "INR",
      }),
      sms("usd-expense", "VM-TEST", now.getTime(), {
        bankName: "Test Bank",
        acc: "XX5678",
        trx: "500.00",
        trxTypeRich: "EXPENSE",
        currency: "USD",
      }),
    ];
    const dashboard = seedLedgerAndProject(db, messages, now);

    const jsSeries = buildSpendingSeries(dashboard.recent, "INR", now, 14);
    const sqlSeries = await queryDailySeries("INR", "expense", now, 14, asyncClientFor(sqlite));

    for (let i = 0; i < jsSeries.length; i++) {
      expect(fromMinorUnits(sqlSeries[i]!.totalMinorUnits, "INR")).toBeCloseTo(
        jsSeries[i]!.value,
        2,
      );
    }
  });
});

describe("queryMonthlySeries parity with buildMonthlySpendSeries/buildMonthlyIncomeSeries", () => {
  it("matches a 6-month expense series, including a month with no activity", async () => {
    const { sqlite, db } = freshDb();
    const now = new Date(2026, 5, 15); // June 2026
    const messages: ParsedSms[] = [
      sms("feb", "VM-TEST", new Date(2026, 1, 10).getTime(), {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "300.00",
        trxTypeRich: "EXPENSE",
      }),
      // March deliberately has no activity — the SQL series must still
      // produce a zero-value bucket for it, same as the JS builder.
      sms("apr-1", "VM-TEST", new Date(2026, 3, 5).getTime(), {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "120.00",
        trxTypeRich: "EXPENSE",
      }),
      sms("apr-2", "VM-TEST", new Date(2026, 3, 25).getTime(), {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "80.00",
        trxTypeRich: "EXPENSE",
      }),
      sms("jun-current", "VM-TEST", now.getTime(), {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "45.00",
        trxTypeRich: "EXPENSE",
      }),
      // Outside the 6-month window (Jan 2026 for a June 2026 "now" with
      // months=6 starts at January) — this one is in December 2025, which
      // must not appear.
      sms("too-old", "VM-TEST", new Date(2025, 11, 15).getTime(), {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "999.00",
        trxTypeRich: "EXPENSE",
      }),
    ];
    const dashboard = seedLedgerAndProject(db, messages, now);

    const jsSeries = buildMonthlySpendSeries(dashboard.recent, "INR", now, 6);
    const sqlSeries = await queryMonthlySeries("INR", "expense", now, 6, asyncClientFor(sqlite));

    expect(sqlSeries).toHaveLength(jsSeries.length);
    for (let i = 0; i < jsSeries.length; i++) {
      expect(sqlSeries[i]!.monthStart).toBe(jsSeries[i]!.monthStart);
      expect(fromMinorUnits(sqlSeries[i]!.totalMinorUnits, "INR")).toBeCloseTo(
        jsSeries[i]!.value,
        2,
      );
    }
  });

  it("matches a 6-month income series against an empty ledger", async () => {
    const { sqlite, db } = freshDb();
    const now = new Date(2026, 5, 15);
    const dashboard = seedLedgerAndProject(db, [], now);

    const jsSeries = buildMonthlyIncomeSeries(dashboard.recent, "INR", now, 6);
    const sqlSeries = await queryMonthlySeries("INR", "income", now, 6, asyncClientFor(sqlite));

    expect(sqlSeries.map((point) => point.monthStart)).toEqual(
      jsSeries.map((point) => point.monthStart),
    );
    expect(sqlSeries.every((point) => point.totalMinorUnits === 0)).toBe(true);
  });
});

describe("queryTransactionsForDay", () => {
  it("reads only the requested currency and local day through the async client", async () => {
    const { sqlite, db } = freshDb();
    const dayStart = new Date(2026, 5, 15).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000 - 1;
    const messages: ParsedSms[] = [
      sms("day-later", "VM-TEST", dayStart + 13 * 60 * 60 * 1000, {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "20.00",
        trxTypeRich: "EXPENSE",
        vendor: "Later",
        currency: "INR",
      }),
      sms("day-earlier", "VM-TEST", dayStart + 9 * 60 * 60 * 1000, {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "10.00",
        trxTypeRich: "EXPENSE",
        vendor: "Earlier",
        currency: "INR",
      }),
      sms("next-day", "VM-TEST", dayEnd + 1, {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "30.00",
        trxTypeRich: "EXPENSE",
        vendor: "Next day",
        currency: "INR",
      }),
      sms("other-currency", "VM-TEST", dayStart + 11 * 60 * 60 * 1000, {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "40.00",
        trxTypeRich: "EXPENSE",
        vendor: "Other currency",
        currency: "USD",
      }),
    ];
    seedLedgerAndProject(db, messages, new Date(dayStart));

    const rows = await queryTransactionsForDay(
      dayStart,
      dayEnd,
      "INR",
      asyncClientFor(sqlite),
    );

    expect(rows.map((row) => row.vendor)).toEqual(["Later", "Earlier"]);
    expect(rows.map((row) => row.amountMinorUnits)).toEqual([2000, 1000]);
  });
});

describe("querySubscriptions", () => {
  it("returns a subscription within the recency window, with its full occurrence count intact", async () => {
    const { sqlite, db } = freshDb();
    const startDate = new Date(2024, 0, 5).getTime();
    const occurrenceCount = 24;
    const messages: ParsedSms[] = Array.from({ length: occurrenceCount }, (_, index) =>
      sms(`netflix-${index}`, "VM-HDFCBK", startDate + index * 30 * 24 * 60 * 60 * 1000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "649.00",
        trxTypeRich: "EXPENSE",
        brandName: "Netflix",
        currency: "INR",
      }),
    );
    const now = new Date(messages[messages.length - 1]!.date);
    seedLedgerAndProject(db, messages, now);

    const rows = await querySubscriptions(now, asyncClientFor(sqlite));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.merchant).toBe("Netflix");
    expect(rows[0]!.count).toBe(occurrenceCount);
    expect(rows[0]!.confidence).toBe("likely");
    expect(fromMinorUnits(rows[0]!.amountMinorUnits, "INR")).toBeCloseTo(649, 2);
  });

  it("excludes a subscription past the recency window at query time, with no new SMS or reprojection", async () => {
    const { sqlite, db } = freshDb();
    const startDate = new Date(2024, 0, 5).getTime();
    const messages: ParsedSms[] = Array.from({ length: 4 }, (_, index) =>
      sms(`spotify-${index}`, "VM-HDFCBK", startDate + index * 30 * 24 * 60 * 60 * 1000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "119.00",
        trxTypeRich: "EXPENSE",
        brandName: "Spotify",
        currency: "INR",
      }),
    );
    const lastOccurrence = messages[messages.length - 1]!.date;
    // Project once, while the subscription is still current.
    seedLedgerAndProject(db, messages, new Date(lastOccurrence));

    // No new SMS, no reprojection — only the clock passed to the query
    // moved past RECENCY_WINDOW_DAYS (60) since the last occurrence. The
    // stored row's own last_date is untouched; only the read is filtered.
    const farFuture = new Date(lastOccurrence + 61 * 24 * 60 * 60 * 1000);

    const rows = await querySubscriptions(farFuture, asyncClientFor(sqlite));

    expect(rows).toHaveLength(0);
  });

  it("keeps a mandate-backed recurring payment out of subscription results", async () => {
    const { sqlite, db } = freshDb();
    const startDate = new Date(2024, 0, 5).getTime();
    const messages: ParsedSms[] = Array.from({ length: 4 }, (_, index) =>
      sms(`autopay-${index}`, "VM-HDFCBK", startDate + index * 30 * 24 * 60 * 60 * 1000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "199.00",
        trxTypeRich: "AUTO_DEBIT",
        brandName: "Spotify",
        mandateId: "UMN123456789",
        mandateEvent: "active",
        currency: "INR",
      }),
    );
    const now = new Date(messages[messages.length - 1]!.date);
    seedLedgerAndProject(db, messages, now);

    const rows = await querySubscriptions(now, asyncClientFor(sqlite));

    expect(rows).toHaveLength(0);
  });

  it("returns an empty list against an empty ledger", async () => {
    const { sqlite, db } = freshDb();
    seedLedgerAndProject(db, [], new Date(2026, 5, 15));

    const rows = await querySubscriptions(new Date(2026, 5, 15), asyncClientFor(sqlite));

    expect(rows).toEqual([]);
  });

  // The regression this guards: deriveDashboard's own `subscriptions` field
  // is already recency-filtered by the `now` it's called with. If
  // replaceProjection persisted THAT field, then rebuilding the projection
  // (an unrelated ingest event — a new, unrelated SMS arriving, or a
  // parser-version reprocess) at any point after a subscription ages past
  // RECENCY_WINDOW_DAYS would call deriveDashboard with a "now" that
  // already excludes it, so the row would never even reach
  // replaceProjection to be re-inserted — the DELETE-then-INSERT-nothing
  // permanently loses it, before querySubscriptions's own read-time filter
  // ever gets a chance to decide. Persisting allSubscriptions (recency-
  // unfiltered) instead of subscriptions is what prevents this.
  it("survives a projection rebuild that happens after the subscription has already aged past recency, with its full count intact", async () => {
    const { sqlite, db } = freshDb();
    const startDate = new Date(2024, 0, 5).getTime();
    const occurrenceCount = 24;
    const messages: ParsedSms[] = Array.from({ length: occurrenceCount }, (_, index) =>
      sms(`netflix-${index}`, "VM-HDFCBK", startDate + index * 30 * 24 * 60 * 60 * 1000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "649.00",
        trxTypeRich: "EXPENSE",
        brandName: "Netflix",
        currency: "INR",
      }),
    );
    const lastOccurrence = messages[messages.length - 1]!.date;

    // First projection: built while the subscription is still current.
    seedLedgerAndProject(db, messages, new Date(lastOccurrence));

    // Simulate a later, unrelated ingest event: an unconnected transaction
    // for a different account arrives 61+ days after Netflix's last
    // charge, and that ingest triggers a full projection rebuild — the
    // exact "unrelated SMS triggers projection rebuilding" step in the
    // failure this test guards. deriveDashboard is called with THIS later
    // "now", which is already past Netflix's recency window.
    const rebuildNow = new Date(lastOccurrence + 61 * 24 * 60 * 60 * 1000);
    const unrelatedMessage = sms("unrelated-txn", "VM-ICICI", rebuildNow.getTime(), {
      bankName: "ICICI Bank",
      acc: "XX9999",
      trx: "50.00",
      trxTypeRich: "EXPENSE",
      brandName: "Some Cafe",
      currency: "INR",
    });
    // Only the new arrival needs inserting into the ledger — the Netflix
    // rows are already there from the first seedLedgerAndProject call, and
    // re-inserting the same ids would violate smsLedger's own primary key,
    // same as a real re-ingest of already-ledgered SMS never happens.
    // deriveDashboardProjection/replaceProjection still run over the FULL
    // combined set, matching how a real rebuild re-derives from the entire
    // ledger.
    db.insert(schema.smsLedger)
      .values({
        id: unrelatedMessage.id,
        sender: unrelatedMessage.sender,
        body: unrelatedMessage.body,
        date: unrelatedMessage.date,
        parserVersion: "test",
        parsedResult: JSON.stringify(unrelatedMessage.result),
        ingestionStatus: "parsed",
        createdAt: unrelatedMessage.date,
      })
      .run();
    const rebuilt = deriveDashboardProjection([...messages, unrelatedMessage], rebuildNow);
    replaceProjection(db, rebuilt);

    // The row must still exist in the database, with its complete count —
    // not deleted, not truncated — because it was persisted from
    // allSubscriptions, which never filtered by recency in the first place.
    const rawRow = db
      .select()
      .from(schema.subscriptions)
      .all()
      .find((row) => row.merchant === "Netflix");
    expect(rawRow).toBeDefined();
    expect(rawRow!.count).toBe(occurrenceCount);

    // querySubscriptions, asked with the same later clock the rebuild used,
    // correctly hides it — recency is still enforced, just at read time.
    const laterRows = await querySubscriptions(rebuildNow, asyncClientFor(sqlite));
    expect(laterRows.find((row) => row.merchant === "Netflix")).toBeUndefined();

    // The same stored row, asked about with an earlier clock (still within
    // 60 days of the last charge), is returned with its full count — proving
    // the data wasn't lost, only filtered differently per query.
    const earlierRows = await querySubscriptions(new Date(lastOccurrence), asyncClientFor(sqlite));
    const netflix = earlierRows.find((row) => row.merchant === "Netflix");
    expect(netflix).toBeDefined();
    expect(netflix!.count).toBe(occurrenceCount);
  });
});
