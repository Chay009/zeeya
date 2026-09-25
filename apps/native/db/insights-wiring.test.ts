// Parity test for the 1B.3 rewire: features/insights/insights-data.ts's
// SQL-backed adapters (querySpendingSeries, queryMonthlySpendSeries, ...)
// now call financeDataSource.insights.* instead of importing
// db/queries.ts's queryDailySeries/queryMonthlySeries/queryCategoryTotals
// directly. This proves financeDataSource.insights (the real wiring in
// features/dashboard/dashboard-data-source.ts) returns byte-identical
// output to calling the underlying db/queries.ts functions directly
// against the same seeded database — i.e. the rewire is a pure boundary
// change, not a behavior change. insights-data.test.ts already unit-tests
// the adapters' own mapping logic against a mocked financeDataSource; this
// test is the other half, proving the real wiring underneath that mock
// matches the pre-rewire direct-call behavior.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, it, expect, vi } from "vitest";
import type { MalanaResult } from "@zeeya/parser/malana";
import { deriveDashboardProjection } from "../lib/dashboard";
import type { ParsedSms } from "../lib/sms";
import { replaceProjection } from "./projections";
import * as schema from "./schema";
import { initializeNativeDatabase } from "./native-init";

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
  return { rawSqlite: sqlite, drizzleDb: drizzle(sqlite, { schema }) };
}

let rawSqlite: Database.Database;
let testDb: ReturnType<typeof freshDb>["drizzleDb"];

function useFreshDb(): void {
  const fresh = freshDb();
  rawSqlite = fresh.rawSqlite;
  testDb = fresh.drizzleDb;
}

// financeDataSource's own db/queries.ts functions read via
// AsyncQueryClient's default client (db/client.native.ts's `sqlite`
// export, not `db`) — mock both `sqlite` and `db` to this test's
// better-sqlite3-backed instances (the same underlying connection, not two
// separate databases) so financeDataSource.insights.* and the directly-
// imported db/queries.ts functions below hit the exact same in-memory
// database.
vi.mock("./client", () => ({
  get db() {
    return testDb;
  },
  get sqlite() {
    return {
      getAllAsync: async <T>(sourceSql: string, params: unknown[]): Promise<T[]> =>
        rawSqlite.prepare(sourceSql).all(...params) as T[],
    };
  },
}));

const { queryCategoryTotals, queryDailySeries, queryMonthlySeries } = await import("./queries");
const { financeDataSource } = await import("../features/dashboard/dashboard-data-source");

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

function seedAndProject(messages: ParsedSms[], now: Date) {
  for (const message of messages) {
    testDb
      .insert(schema.smsLedger)
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
      .onConflictDoNothing()
      .run();
  }
  const projection = deriveDashboardProjection(messages, now);
  replaceProjection(testDb, projection);
  testDb
    .insert(schema.projectionState)
    .values({
      id: "dashboard",
      sourceRevision: 1,
      projectedRevision: 1,
      updatedAt: now.getTime(),
    })
    .onConflictDoUpdate({
      target: schema.projectionState.id,
      set: { sourceRevision: 1, projectedRevision: 1, updatedAt: now.getTime() },
    })
    .run();
}

function fixtureMessages(now: Date): ParsedSms[] {
  return Array.from({ length: 40 }, (_, index) =>
    sms(`msg-${index}`, "VM-HDFCBK", now.getTime() - index * 24 * 60 * 60 * 1000, {
      bankName: "HDFC Bank",
      acc: "XX1234",
      trx: `${100 + index}.00`,
      trxTypeRich: index % 3 === 0 ? "SALARY" : "EXPENSE",
      merchantCategory: index % 2 === 0 ? "food" : "travel",
    }),
  );
}

describe("financeDataSource.insights parity with direct db/queries.ts calls", () => {
  it("loadDailySeries returns byte-identical output to queryDailySeries for the same window", async () => {
    useFreshDb();
    const now = new Date(2026, 7, 25, 12);
    seedAndProject(fixtureMessages(now), now);

    const direct = await queryDailySeries("INR", "expense", now, 31);
    const viaDataSource = await financeDataSource.insights.loadDailySeries({
      currency: "INR",
      direction: "expense",
      at: now.getTime(),
      days: 31,
    });

    expect(viaDataSource).toEqual(direct);
    expect(direct.some((point) => point.totalMinorUnits > 0)).toBe(true);
  });

  it("loadMonthlySeries returns byte-identical output to queryMonthlySeries for the same window", async () => {
    useFreshDb();
    const now = new Date(2026, 7, 25, 12);
    seedAndProject(fixtureMessages(now), now);

    const direct = await queryMonthlySeries("INR", "income", now, 6);
    const viaDataSource = await financeDataSource.insights.loadMonthlySeries({
      currency: "INR",
      direction: "income",
      at: now.getTime(),
      months: 6,
    });

    expect(viaDataSource).toEqual(direct);
    expect(direct.some((point) => point.totalMinorUnits > 0)).toBe(true);
  });

  it("loadCategoryTotals returns byte-identical output to queryCategoryTotals for the same month", async () => {
    useFreshDb();
    const now = new Date(2026, 7, 25, 12);
    seedAndProject(fixtureMessages(now), now);

    const direct = await queryCategoryTotals("INR", now);
    const viaDataSource = await financeDataSource.insights.loadCategoryTotals({
      currency: "INR",
      at: now.getTime(),
    });

    expect(viaDataSource).toEqual(direct);
    expect(direct.length).toBeGreaterThan(0);
  });

  it("defaults days/months the same way when omitted", async () => {
    useFreshDb();
    const now = new Date(2026, 7, 25, 12);
    seedAndProject(fixtureMessages(now), now);

    const directDaily = await queryDailySeries("INR", "expense", now);
    const viaDataSourceDaily = await financeDataSource.insights.loadDailySeries({
      currency: "INR",
      direction: "expense",
      at: now.getTime(),
    });
    expect(viaDataSourceDaily).toEqual(directDaily);

    const directMonthly = await queryMonthlySeries("INR", "expense", now);
    const viaDataSourceMonthly = await financeDataSource.insights.loadMonthlySeries({
      currency: "INR",
      direction: "expense",
      at: now.getTime(),
    });
    expect(viaDataSourceMonthly).toEqual(directMonthly);
  });
});
