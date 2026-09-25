// Parity tests: features/home-preview/data.ts's
// createHomePreviewDataFromReadModel (built from the bounded HomeReadModel
// this directory's own queries-home.ts produces) must render the same
// presentation output as the legacy createHomePreviewData (built from the
// complete Dashboard) for identical seed data — that's the whole point of
// Phase 1B.4 sub-slice 4's rewrite. Lives alongside queries-home.test.ts
// (not under features/home-preview/) because it needs the exact same
// same-directory "./client" mock that file's own db/queries-home.ts import
// resolves against — vi.mock matches by the specifier a module actually
// imports, and queries-home.ts always imports "./client" relative to this
// directory.
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
  return { sqlite, drizzleDb: drizzle(sqlite, { schema }) };
}

let rawSqlite: Database.Database;
let testDb: ReturnType<typeof freshDb>["drizzleDb"];

function useFreshDb(): void {
  const fresh = freshDb();
  rawSqlite = fresh.sqlite;
  testDb = fresh.drizzleDb;
}

// Same mock shape as queries-home.test.ts — both the sync `db` (used by
// db/ingestion.ts's projection-status bookkeeping) and the async `sqlite`
// (used by every queryHome* function) must resolve to this same in-memory
// connection.
vi.mock("./client", () => ({
  get db() {
    return testDb;
  },
  get sqlite() {
    return rawSqlite
      ? {
          getAllAsync: async <T>(source: string, params: unknown[]) =>
            rawSqlite.prepare(source).all(...(params as unknown[])) as T[],
        }
      : null;
  },
}));

const { homeDataSource } = await import("./queries-home");
const { createHomePreviewData: legacyCreateHomePreviewData, createHomePreviewDataFromReadModel } =
  await import("../features/home-preview/data");

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

// projectActivityRows only produces an `activity` table row for a category
// present in matchedCategories — a plain sms() with no matchedCategories
// never reaches HomeReadModel.recentActivity at all. Use this instead of
// sms() for any fixture whose test asserts on activity.items/allItems.
function smsWithActivityRow(
  id: string,
  sender: string,
  date: number,
  matchedCategories: MalanaResult["matchedCategories"],
  r: Partial<MalanaResult>,
): ParsedSms {
  return {
    id,
    sender,
    body: "",
    date,
    result: { ...result(r), matchedCategories },
  };
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
  return projection.dashboard;
}

describe("createHomePreviewDataFromReadModel — parity with the legacy Dashboard-based builder", () => {
  it("matches account balances, status, and captured totals for a tracked (unreported) account", async () => {
    useFreshDb();
    const messages = [
      sms("bal-1", "VM-HDFCBK", 1000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "500.00",
        trxTypeRich: "EXPENSE",
      }),
      sms("bal-2", "VM-HDFCBK", 2000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "100.00",
        trxTypeRich: "SALARY",
      }),
    ];
    const at = new Date(3000);
    const dashboard = seedAndProject(messages, at);
    const model = await homeDataSource.load({ currency: "INR", at: at.getTime() });

    const legacy = legacyCreateHomePreviewData(dashboard, true, at);
    const readModel = createHomePreviewDataFromReadModel(model, true, at);

    expect(readModel.accounts).toHaveLength(1);
    expect(legacy.accounts).toHaveLength(1);
    expect(readModel.accounts[0]).toMatchObject({
      bankName: legacy.accounts[0]!.bankName,
      status: legacy.accounts[0]!.status,
      balance: legacy.accounts[0]!.balance,
      last4: legacy.accounts[0]!.last4,
      currency: legacy.accounts[0]!.currency,
      capturedIncome: legacy.accounts[0]!.capturedIncome,
      capturedExpense: legacy.accounts[0]!.capturedExpense,
      capturedChange: legacy.accounts[0]!.capturedChange,
      capturedTransactionCount: legacy.accounts[0]!.capturedTransactionCount,
    });
  });

  it("matches a reported/anchored account's balance, reportedBalance, and reconciliation", async () => {
    useFreshDb();
    const messages = [
      sms("debit-1", "VM-HDFCBK", 1000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "50.00",
        trxTypeRich: "EXPENSE",
      }),
      sms("balance-1", "VM-HDFCBK", 2000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        bal: "1000.00",
      }),
      sms("debit-2", "VM-HDFCBK", 3000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "25.00",
        trxTypeRich: "EXPENSE",
      }),
    ];
    const at = new Date(4000);
    const dashboard = seedAndProject(messages, at);
    const model = await homeDataSource.load({ currency: "INR", at: at.getTime() });

    const legacy = legacyCreateHomePreviewData(dashboard, true, at);
    const readModel = createHomePreviewDataFromReadModel(model, true, at);

    expect(readModel.accounts[0]).toMatchObject({
      status: legacy.accounts[0]!.status,
      balance: legacy.accounts[0]!.balance,
      reportedBalance: legacy.accounts[0]!.reportedBalance,
      capturedExpense: legacy.accounts[0]!.capturedExpense,
      capturedTransactionCount: legacy.accounts[0]!.capturedTransactionCount,
    });
  });

  it("matches hasNewerSuggestedReading's unassignedNote against the legacy newerSuggested note", async () => {
    useFreshDb();
    const messages = [
      sms("bal-1", "VM-HDFCBK", 1000, { bankName: "HDFC Bank", acc: "XX1234", bal: "1000.00" }),
      sms("unassigned-1", "VM-HDFCBK", 5000, { bankName: "HDFC Bank", acc: null, bal: "999.00" }),
    ];
    const at = new Date(6000);
    const dashboard = seedAndProject(messages, at);
    const model = await homeDataSource.load({ currency: "INR", at: at.getTime() });

    const legacy = legacyCreateHomePreviewData(dashboard, true, at);
    const readModel = createHomePreviewDataFromReadModel(model, true, at);

    expect(legacy.accounts[0]!.unassignedNote).not.toBeNull();
    expect(readModel.accounts[0]!.unassignedNote).not.toBeNull();
  });

  it("matches detected accounts and the single latest unassigned reading per bank", async () => {
    useFreshDb();
    const messages = [
      sms("mandate-1", "VM-ICICIB", 1000, {
        bankName: "ICICI Bank",
        acc: "XX9999",
        mandateId: "UMN1",
        mandateMerchant: "Netflix",
        mandateAmount: "199.00",
        mandateEvent: "active",
      }),
      sms("unassigned-1", "VM-HDFCBK", 1000, { bankName: "HDFC Bank", acc: null, bal: "100.00" }),
      sms("unassigned-2", "VM-HDFCBK", 2000, { bankName: "HDFC Bank", acc: null, bal: "200.00" }),
    ];
    const at = new Date(3000);
    const dashboard = seedAndProject(messages, at);
    const model = await homeDataSource.load({ currency: "INR", at: at.getTime() });

    const legacy = legacyCreateHomePreviewData(dashboard, true, at);
    const readModel = createHomePreviewDataFromReadModel(model, true, at);

    expect(readModel.detectedAccounts).toHaveLength(legacy.detectedAccounts.length);
    expect(readModel.detectedAccounts[0]).toMatchObject({
      bankName: legacy.detectedAccounts[0]!.bankName,
      last4: legacy.detectedAccounts[0]!.last4,
    });
    expect(readModel.unassignedReadings).toHaveLength(1);
    expect(readModel.unassignedReadings[0]!.balance).toBe(legacy.unassignedReadings[0]!.balance);
  });

  it("matches the 7-day flow chart's income/expense totals", async () => {
    useFreshDb();
    const at = new Date(2024, 5, 15, 10, 0, 0);
    const messages = [
      sms("income-today", "VM-HDFCBK", at.getTime(), {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "500.00",
        trxTypeRich: "SALARY",
      }),
      sms("expense-yesterday", "VM-HDFCBK", at.getTime() - 24 * 60 * 60 * 1000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "100.00",
        trxTypeRich: "EXPENSE",
      }),
    ];
    const dashboard = seedAndProject(messages, at);
    const model = await homeDataSource.load({ currency: "INR", at: at.getTime() });

    const legacy = legacyCreateHomePreviewData(dashboard, true, at);
    const readModel = createHomePreviewDataFromReadModel(model, true, at);

    expect(readModel.cashflow.flowChart).toEqual(legacy.cashflow.flowChart);
  });

  it("matches calendar month labels and per-day signed nets", async () => {
    useFreshDb();
    const at = new Date(2024, 5, 15);
    const messages = [
      sms("expense-1", "VM-HDFCBK", at.getTime(), {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "100.00",
        trxTypeRich: "EXPENSE",
      }),
      sms("income-1", "VM-HDFCBK", at.getTime(), {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "500.00",
        trxTypeRich: "SALARY",
      }),
    ];
    const dashboard = seedAndProject(messages, at);
    const model = await homeDataSource.load({ currency: "INR", at: at.getTime() });

    const legacy = legacyCreateHomePreviewData(dashboard, true, at);
    const readModel = createHomePreviewDataFromReadModel(model, true, at);

    const legacyCurrentMonth = legacy.cashflow.calendarMonths.find((m) => m.today !== undefined);
    const readModelCurrentMonth = readModel.cashflow.calendarMonths.find(
      (m) => m.today !== undefined,
    );
    expect(readModelCurrentMonth?.nets).toEqual(legacyCurrentMonth?.nets);
    expect(readModelCurrentMonth?.offset).toBe(legacyCurrentMonth?.offset);
    expect(readModelCurrentMonth?.days).toBe(legacyCurrentMonth?.days);
  });

  it("matches subscription/mandate preview cards including reactivated mandates", async () => {
    useFreshDb();
    const messages: ParsedSms[] = [];
    messages.push(
      sms("mandate-create", "VM-HDFCBK", 1000, {
        mandateId: "UMN1",
        mandateMerchant: "Netflix",
        mandateAmount: "199.00",
        mandateEvent: "active",
      }),
      sms("mandate-cancel", "VM-HDFCBK", 2000, {
        mandateId: "UMN1",
        mandateMerchant: "Netflix",
        mandateAmount: "199.00",
        mandateEvent: "cancelled",
      }),
      sms("mandate-reactivate", "VM-HDFCBK", 3000, {
        mandateId: "UMN1",
        mandateMerchant: "Netflix",
        mandateAmount: "199.00",
        mandateEvent: "active",
      }),
    );
    const at = new Date(4000);
    const dashboard = seedAndProject(messages, at);
    const model = await homeDataSource.load({ currency: "INR", at: at.getTime() });

    const legacy = legacyCreateHomePreviewData(dashboard, true, at);
    const readModel = createHomePreviewDataFromReadModel(model, true, at);

    expect(readModel.subscriptions.items).toHaveLength(1);
    expect(legacy.subscriptions.items).toHaveLength(1);
    expect(readModel.subscriptions.items[0]).toMatchObject({
      name: legacy.subscriptions.items[0]!.name,
      status: legacy.subscriptions.items[0]!.status,
      amount: legacy.subscriptions.items[0]!.amount,
      reactivated: legacy.subscriptions.items[0]!.reactivated,
    });
    expect(readModel.subscriptions.activeCount).toBe(legacy.subscriptions.activeCount);
    expect(readModel.subscriptions.cancelledCount).toBe(legacy.subscriptions.cancelledCount);
    expect(readModel.subscriptions.monthlySpend).toBe(legacy.subscriptions.monthlySpend);
  });

  it("matches activity row presentation (name, amount, pills) for a financial transaction", async () => {
    useFreshDb();
    const messages = [
      smsWithActivityRow("txn-1", "VM-HDFCBK", 1000, ["GRM_BANK"], {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "199.00",
        trxTypeRich: "EXPENSE",
        brandName: "Netflix",
        subcategory: "upi",
        isFromCard: true,
      }),
    ];
    const at = new Date(2000);
    const dashboard = seedAndProject(messages, at);
    const model = await homeDataSource.load({ currency: "INR", at: at.getTime() });

    const legacy = legacyCreateHomePreviewData(dashboard, true, at);
    const readModel = createHomePreviewDataFromReadModel(model, true, at);

    const legacyItem = legacy.activity.allItems.find((item) => item.name === "Netflix");
    const readModelItem = readModel.activity.allItems.find((item) => item.name === "Netflix");
    expect(legacyItem).toBeDefined();
    expect(readModelItem).toBeDefined();
    expect(readModelItem).toMatchObject({
      name: legacyItem!.name,
      amount: legacyItem!.amount,
      direction: legacyItem!.direction,
      tile: legacyItem!.tile,
      ink: legacyItem!.ink,
      bar: legacyItem!.bar,
    });
    // Same pill tones present (card, subcategory, type) — pill ordering
    // matches since both builders build the identical list shape.
    expect(readModelItem!.pills.map((p) => p.tone).sort()).toEqual(
      legacyItem!.pills.map((p) => p.tone).sort(),
    );
  });

  it("marks a mandate-linked transaction as recurring the same way the legacy path does", async () => {
    useFreshDb();
    const messages = [
      sms("mandate-1", "VM-HDFCBK", 1000, {
        mandateId: "UMN1",
        mandateMerchant: "Netflix",
        mandateAmount: "199.00",
        mandateEvent: "active",
      }),
      smsWithActivityRow("txn-1", "VM-HDFCBK", 2000, ["GRM_BANK"], {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "199.00",
        trxTypeRich: "EXPENSE",
        brandName: "Netflix",
        mandateId: "UMN1",
      }),
    ];
    const at = new Date(3000);
    const dashboard = seedAndProject(messages, at);
    const model = await homeDataSource.load({ currency: "INR", at: at.getTime() });

    const legacy = legacyCreateHomePreviewData(dashboard, true, at);
    const readModel = createHomePreviewDataFromReadModel(model, true, at);

    const legacyItem = legacy.activity.allItems.find((item) => item.name === "Netflix");
    const readModelItem = readModel.activity.allItems.find((item) => item.name === "Netflix");
    expect(legacyItem?.pills.some((p) => p.tone === "recurring")).toBe(true);
    expect(readModelItem?.pills.some((p) => p.tone === "recurring")).toBe(true);
  });

  it("shows '—' placeholders and empty collections when not ready, same as the legacy path", async () => {
    useFreshDb();
    const at = new Date(1000);
    const dashboard = seedAndProject([], at);

    const legacy = legacyCreateHomePreviewData(dashboard, false, at);
    // An empty, ready-shaped HomeReadModel — mirrors what a caller would
    // pass while `ready` is still false (no fetch has completed yet).
    const emptyModel = await homeDataSource.load({ currency: "INR", at: at.getTime() });
    const readModel = createHomePreviewDataFromReadModel(emptyModel, false, at);

    expect(readModel.account.balance).toBe("—");
    expect(legacy.account.balance).toBe("—");
    expect(readModel.activity.items).toEqual([]);
    expect(legacy.activity.items).toEqual([]);
  });

  // Regression: account ordering must be "most recently updated" (whichever
  // is newer of balanceAsOf/estimatedAsOf), matching the legacy path's own
  // accountPreviews.sort((l, r) => r.updatedAt - l.updatedAt) — a plain
  // ORDER BY balance_as_of DESC alone would put a reported-but-stale
  // account ahead of an unreported-but-recently-active one, changing both
  // visible order and which account becomes the primary `account`.
  it("orders multiple accounts by most-recently-updated (balanceAsOf or estimatedAsOf), matching the legacy path", async () => {
    useFreshDb();
    const messages = [
      // Account A: reported balance long ago, no transactions since — its
      // own "last updated" is that old balanceAsOf.
      sms("a-balance", "VM-HDFCBK", 1000, {
        bankName: "HDFC Bank",
        acc: "XX1111",
        bal: "1000.00",
      }),
      // Account B: reported balance even older, but a transaction AFTER
      // that balance pushes its estimatedAsOf newer than account A's own
      // balanceAsOf — B must rank ahead of A despite A's own balanceAsOf
      // being a later absolute date than B's initial balance report.
      sms("b-balance", "VM-ICICIB", 500, {
        bankName: "ICICI Bank",
        acc: "XX2222",
        bal: "2000.00",
      }),
      sms("b-txn-after", "VM-ICICIB", 5000, {
        bankName: "ICICI Bank",
        acc: "XX2222",
        trx: "50.00",
        trxTypeRich: "EXPENSE",
      }),
    ];
    const at = new Date(6000);
    const dashboard = seedAndProject(messages, at);
    const model = await homeDataSource.load({ currency: "INR", at: at.getTime() });

    const legacy = legacyCreateHomePreviewData(dashboard, true, at);
    const readModel = createHomePreviewDataFromReadModel(model, true, at);

    expect(legacy.accounts).toHaveLength(2);
    expect(readModel.accounts).toHaveLength(2);
    // Legacy's own updatedAt-based order determines the expected order —
    // assert the read-model path reproduces exactly that order, including
    // which account becomes the primary `account`.
    expect(readModel.accounts.map((a) => a.bankName)).toEqual(
      legacy.accounts.map((a) => a.bankName),
    );
    expect(readModel.account.bankName).toBe(legacy.account.bankName);
    expect(legacy.account.bankName).toBe("ICICI Bank");
  });
});

describe("createHomePreviewDataFromReadModel — read-model-specific correctness", () => {
  it("never includes `raw` on its activity items (the bounded model has no ParsedSms to offer)", async () => {
    useFreshDb();
    const messages = [
      smsWithActivityRow("txn-1", "VM-HDFCBK", 1000, ["GRM_BANK"], {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "100.00",
        trxTypeRich: "EXPENSE",
      }),
    ];
    const at = new Date(2000);
    seedAndProject(messages, at);
    const model = await homeDataSource.load({ currency: "INR", at: at.getTime() });
    const readModel = createHomePreviewDataFromReadModel(model, true, at);

    expect(readModel.activity.allItems.length).toBeGreaterThan(0);
    for (const item of readModel.activity.allItems) {
      expect(item).not.toHaveProperty("raw");
    }
  });

  it("routes detailTarget to the transaction for a financial message and to the activity row for a non-financial one", async () => {
    useFreshDb();
    const messages = [
      smsWithActivityRow("txn-1", "VM-HDFCBK", 1000, ["GRM_BANK"], {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "100.00",
        trxTypeRich: "EXPENSE",
      }),
      smsWithActivityRow("delivery-1", "VM-DELIVR", 2000, ["GRM_DELIVERY"], {}),
    ];
    const at = new Date(3000);
    seedAndProject(messages, at);
    const model = await homeDataSource.load({ currency: "INR", at: at.getTime() });
    const readModel = createHomePreviewDataFromReadModel(model, true, at);

    const financial = readModel.activity.allItems.find((item) => item.key === "activity:txn-1");
    const nonFinancial = readModel.activity.allItems.find(
      (item) => item.key === "activity:delivery-1",
    );
    expect(financial?.detailTarget.kind).toBe("transaction");
    expect(nonFinancial?.detailTarget.kind).toBe("activity");
  });

  // Regression: a "neutral"-direction transaction (e.g. WALLET_CREDIT — an
  // internal wallet top-up, neither real income nor expense — see
  // lib/transaction-direction.ts's own comment) must render no amount at
  // all, matching the legacy path's own financialEntries() filter (which
  // excludes "neutral" entries entirely, so buildActivity's `entry ?
  // formatSignedAmount(...) : null` always resolves to null for one). A
  // naive "income ? positive : negative" rule would wrongly render this as
  // a negative expense.
  it("renders no amount for a neutral-direction transaction, matching the legacy path", async () => {
    useFreshDb();
    const messages = [
      smsWithActivityRow("wallet-credit-1", "VM-HDFCBK", 1000, ["GRM_BANK"], {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "100.00",
        trxTypeRich: "WALLET_CREDIT",
      }),
    ];
    const at = new Date(2000);
    const dashboard = seedAndProject(messages, at);
    const model = await homeDataSource.load({ currency: "INR", at: at.getTime() });

    const legacy = legacyCreateHomePreviewData(dashboard, true, at);
    const readModel = createHomePreviewDataFromReadModel(model, true, at);

    const legacyItem = legacy.activity.allItems.find(
      (item) => item.key === "activity:wallet-credit-1",
    );
    const readModelItem = readModel.activity.allItems.find(
      (item) => item.key === "activity:wallet-credit-1",
    );
    expect(legacyItem?.direction).toBe("neutral");
    expect(legacyItem?.amount).toBeNull();
    expect(readModelItem?.direction).toBe("neutral");
    expect(readModelItem?.amount).toBeNull();
  });

  // Regression: HomeReadModel.currency (not a caller-supplied
  // selectedCurrency) is what flowDays/calendarMonths must be trusted as
  // scoped to — a model loaded for INR must never have its flow/calendar
  // values relabeled as a different currency.
  it("trusts model.currency for flow/calendar scope, ignoring any other currency the model's own accounts might carry", async () => {
    useFreshDb();
    const messages = [
      sms("inr-expense", "VM-HDFCBK", 1000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "100.00",
        trxTypeRich: "EXPENSE",
        currency: "INR",
      }),
      sms("usd-expense", "VM-USBANK", 1000, {
        bankName: "US Bank",
        acc: "XX5678",
        trx: "50.00",
        trxTypeRich: "EXPENSE",
        currency: "USD",
      }),
    ];
    const at = new Date(2000);
    seedAndProject(messages, at);
    const inrModel = await homeDataSource.load({ currency: "INR", at: at.getTime() });
    const usdModel = await homeDataSource.load({ currency: "USD", at: at.getTime() });

    expect(inrModel.currency).toBe("INR");
    expect(usdModel.currency).toBe("USD");

    const inrPreview = createHomePreviewDataFromReadModel(inrModel, true, at);
    const usdPreview = createHomePreviewDataFromReadModel(usdModel, true, at);

    expect(inrPreview.cashflow.selectedCurrency).toBe("INR");
    expect(usdPreview.cashflow.selectedCurrency).toBe("USD");

    // flowBars alone can't prove this — each series is independently
    // normalized to a 0-103 bar height, so swapped ₹100/$50 data would
    // still produce "both positive" bars. Assert the underlying minor-unit
    // totals directly instead: the INR model's own flowDays must sum to
    // exactly the ₹100 expense (10000 paise), never the $50 one, and vice
    // versa — proving the right currency's amount, not just some amount,
    // reached each model.
    const inrExpenseMinorUnits = inrModel.flowDays.reduce(
      (sum, day) => sum + day.expenseMinorUnits,
      0,
    );
    const usdExpenseMinorUnits = usdModel.flowDays.reduce(
      (sum, day) => sum + day.expenseMinorUnits,
      0,
    );
    expect(inrExpenseMinorUnits).toBe(10000);
    expect(usdExpenseMinorUnits).toBe(5000);

    // Same proof at the presentation layer: the formatted calendar expense
    // for the current month must show the currency-correct symbol and
    // amount, not a mislabeled figure from the other currency's data.
    const inrCurrentMonth = inrPreview.cashflow.calendarMonths.find((m) => m.today !== undefined);
    const usdCurrentMonth = usdPreview.cashflow.calendarMonths.find((m) => m.today !== undefined);
    expect(inrCurrentMonth?.spent).toBe("₹100");
    expect(usdCurrentMonth?.spent).toBe("USD 50");
  });
});
