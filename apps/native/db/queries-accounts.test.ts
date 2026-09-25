// Tests db/queries-accounts.ts against a real SQLite database (better-
// sqlite3, same approach as ingestion.test.ts) — proving the SQL/keyset
// pagination behavior, not mocking drizzle. Seeds via replaceProjection
// (deriveDashboardProjection → projections.ts), same as
// projections.test.ts and queries.test.ts, so fixtures go through the
// exact write path production uses.
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

// db/client.native.ts opens a real expo-sqlite connection at module load,
// which doesn't exist in this Node test environment — mock the whole
// module so both queries-accounts.ts's and ingestion.ts's (transitively,
// via ensureDashboardProjectionCurrent) `import { db } from "./client"`
// resolve to this test's in-memory better-sqlite3 instance instead.
// queryDetectedAccounts now reads through the async `sqlite` client (see
// db/queries-accounts.ts's own queryDetectedAccountsUnsafe comment for
// why), not the sync `db` every other query in this file still uses — both
// must resolve to the same underlying in-memory connection so writes made
// via testDb (drizzle) are visible to reads issued via this adapter.
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

const { queryAccounts, queryBalanceHistory, queryDetectedAccounts, queryUnassignedReadings } =
  await import("./queries-accounts");

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
  // ensureDashboardProjectionCurrent gates every query in queries-accounts.ts
  // on projectedRevision === sourceRevision — seed both to 1 directly rather
  // than routing through ingestSmsBatch, since this suite is proving the
  // read queries, not re-proving ingestion's own revision bookkeeping.
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

describe("queryAccounts", () => {
  it("reports anchorStatus and null balances for an unreported (transaction/mandate-only) account", async () => {
    useFreshDb();
    const messages = [
      sms("trx-1", "VM-HDFCBK", 1000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "500.00",
        trxTypeRich: "EXPENSE",
      }),
    ];
    seedAndProject(messages, new Date(2000));

    const rows = await queryAccounts();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      bankName: "HDFC Bank",
      last4: "1234",
      anchorStatus: "unreported",
      balanceMinorUnits: null,
      estimatedBalanceMinorUnits: null,
    });
  });

  it("reports a real reported balance distinctly from an unreported account, never as 0", async () => {
    useFreshDb();
    const messages = [
      sms("balance-1", "VM-HDFCBK", 1000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        bal: "0.00",
      }),
    ];
    seedAndProject(messages, new Date(2000));

    const rows = await queryAccounts();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      anchorStatus: "reported",
      balanceMinorUnits: 0,
    });
    // A real reported zero balance must round-trip as 0, not null — only
    // an unreported account (no bal ever seen) should read null.
    expect(rows[0]!.balanceMinorUnits).not.toBeNull();
  });

  it("returns an empty array when no accounts exist", async () => {
    useFreshDb();
    seedAndProject([], new Date(2000));
    expect(await queryAccounts()).toEqual([]);
  });

  it("reports captured income/expense/change/count for transactions after the balance anchor", async () => {
    useFreshDb();
    const messages = [
      sms("balance-1", "VM-HDFCBK", 1000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        bal: "1000.00",
      }),
      sms("income-1", "VM-HDFCBK", 2000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "500.00",
        trxTypeRich: "SALARY",
      }),
      sms("expense-1", "VM-HDFCBK", 3000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "200.00",
        trxTypeRich: "EXPENSE",
      }),
    ];
    seedAndProject(messages, new Date(4000));

    const rows = await queryAccounts();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.capturedIncomeMinorUnits).toBe(50000);
    expect(rows[0]!.capturedExpenseMinorUnits).toBe(20000);
    expect(rows[0]!.capturedChangeMinorUnits).toBe(30000);
    expect(rows[0]!.capturedTransactionCount).toBe(2);
  });

  it("reports zero (never null) captured fields for an account with no captured transactions", async () => {
    useFreshDb();
    const messages = [
      sms("balance-1", "VM-HDFCBK", 1000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        bal: "1000.00",
      }),
    ];
    seedAndProject(messages, new Date(2000));

    const rows = await queryAccounts();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.capturedIncomeMinorUnits).toBe(0);
    expect(rows[0]!.capturedExpenseMinorUnits).toBe(0);
    expect(rows[0]!.capturedChangeMinorUnits).toBe(0);
    expect(rows[0]!.capturedTransactionCount).toBe(0);
  });
});

describe("queryDetectedAccounts", () => {
  it("does not duplicate a confirmed account as a detected one", async () => {
    useFreshDb();
    const messages = [
      sms("balance-1", "VM-HDFCBK", 1000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        bal: "1000.00",
      }),
    ];
    const dashboard = seedAndProject(messages, new Date(2000));
    expect(dashboard.detectedAccounts).toHaveLength(0);

    const confirmed = await queryAccounts();
    const detected = await queryDetectedAccounts();
    expect(confirmed).toHaveLength(1);
    expect(detected).toHaveLength(0);
  });

  it("surfaces a mandate-only identity (no transaction, no balance) as detected, not confirmed", async () => {
    useFreshDb();
    const messages = [
      sms("mandate-1", "VM-HDFCBK", 1000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        mandateId: "UMN123",
        mandateMerchant: "Netflix",
        mandateAmount: "499.00",
        mandateEvent: "active",
      }),
    ];
    const dashboard = seedAndProject(messages, new Date(2000));
    expect(dashboard.detectedAccounts).toHaveLength(1);

    const confirmed = await queryAccounts();
    const detected = await queryDetectedAccounts();
    expect(confirmed).toHaveLength(0);
    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({ bankName: "HDFC Bank", last4: "1234" });
  });

  it("promotes a detected account to confirmed once a real balance/transaction arrives, on the next projection", async () => {
    useFreshDb();
    const mandateOnly = [
      sms("mandate-1", "VM-HDFCBK", 1000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        mandateId: "UMN123",
        mandateMerchant: "Netflix",
        mandateAmount: "499.00",
        mandateEvent: "active",
      }),
    ];
    seedAndProject(mandateOnly, new Date(2000));
    expect(await queryDetectedAccounts()).toHaveLength(1);
    expect(await queryAccounts()).toHaveLength(0);

    const withBalance = [
      ...mandateOnly,
      sms("balance-1", "VM-HDFCBK", 2000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        bal: "1000.00",
      }),
    ];
    seedAndProject(withBalance, new Date(3000));

    const confirmed = await queryAccounts();
    const detected = await queryDetectedAccounts();
    expect(confirmed).toHaveLength(1);
    expect(detected).toHaveLength(0);
  });
});

describe("queryBalanceHistory", () => {
  function balanceMessages(count: number, accountKey: { bankName: string; acc: string }) {
    return Array.from({ length: count }, (_, index) =>
      sms(`reading-${index}`, "VM-HDFCBK", 1000 + index * 1000, {
        bankName: accountKey.bankName,
        acc: accountKey.acc,
        bal: `${1000 + index}.00`,
      }),
    );
  }

  it("is scoped to one account and does not include another account's readings", async () => {
    useFreshDb();
    const messages = [
      ...balanceMessages(2, { bankName: "HDFC Bank", acc: "XX1234" }),
      sms("other-account", "VM-ICICIB", 5000, {
        bankName: "ICICI Bank",
        acc: "XX9999",
        bal: "500.00",
      }),
    ];
    seedAndProject(messages, new Date(10000));

    const accounts = await queryAccounts();
    const hdfc = accounts.find((a) => a.bankName === "HDFC Bank")!;
    const page = await queryBalanceHistory({ accountId: hdfc.id });
    expect(page.items).toHaveLength(2);
    expect(page.items.every((r) => r.accountId === hdfc.id)).toBe(true);
  });

  it("orders newest-first and paginates with a stable keyset cursor", async () => {
    useFreshDb();
    const messages = balanceMessages(5, { bankName: "HDFC Bank", acc: "XX1234" });
    seedAndProject(messages, new Date(10000));
    const accounts = await queryAccounts();
    const accountId = accounts[0]!.id;

    const firstPage = await queryBalanceHistory({ accountId, limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.items[0]!.asOf).toBeGreaterThan(firstPage.items[1]!.asOf);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await queryBalanceHistory({
      accountId,
      limit: 2,
      cursor: firstPage.nextCursor!,
    });
    expect(secondPage.items).toHaveLength(2);
    // No overlap and no gap: the five readings are fully covered by the
    // three pages with no id repeated.
    const seenIds = new Set([...firstPage.items, ...secondPage.items].map((r) => r.id));
    expect(seenIds.size).toBe(4);

    const thirdPage = await queryBalanceHistory({
      accountId,
      limit: 2,
      cursor: secondPage.nextCursor!,
    });
    expect(thirdPage.items).toHaveLength(1);
    expect(thirdPage.nextCursor).toBeNull();
  });

  it("does not skip or duplicate rows that share the exact same asOf timestamp", async () => {
    useFreshDb();
    // Two readings for the same account at the identical timestamp — only
    // the id tiebreaker in the keyset condition can page through these
    // correctly; a cursor keyed on asOf alone would either skip or repeat
    // one of them.
    const messages = [
      sms("same-time-a", "VM-HDFCBK", 5000, { bankName: "HDFC Bank", acc: "XX1234", bal: "10.00" }),
      sms("same-time-b", "VM-HDFCBK", 5000, { bankName: "HDFC Bank", acc: "XX1234", bal: "20.00" }),
    ];
    seedAndProject(messages, new Date(10000));
    const accounts = await queryAccounts();
    const accountId = accounts[0]!.id;

    const firstPage = await queryBalanceHistory({ accountId, limit: 1 });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await queryBalanceHistory({
      accountId,
      limit: 1,
      cursor: firstPage.nextCursor!,
    });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]!.id).not.toBe(firstPage.items[0]!.id);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("rejects a limit outside the valid range instead of silently clamping", async () => {
    useFreshDb();
    seedAndProject([], new Date(2000));
    await expect(queryBalanceHistory({ accountId: "does-not-matter", limit: 0 })).rejects.toThrow(
      /limit/i,
    );
    await expect(queryBalanceHistory({ accountId: "does-not-matter", limit: 101 })).rejects.toThrow(
      /limit/i,
    );
    await expect(queryBalanceHistory({ accountId: "does-not-matter", limit: 1.5 })).rejects.toThrow(
      /limit/i,
    );
  });

  it("returns an empty page, not an error, for an account with no readings", async () => {
    useFreshDb();
    seedAndProject([], new Date(2000));
    const page = await queryBalanceHistory({ accountId: "nonexistent|0000" });
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });
});

describe("queryUnassignedReadings", () => {
  it("is not silently attached to any confirmed account", async () => {
    useFreshDb();
    // No account digits on this one — parser found a balance but no `acc`,
    // and there's no other confirmed account of this bank+currency to
    // suggest it against.
    const messages = [
      sms("unassigned-1", "VM-HDFCBK", 1000, {
        bankName: "HDFC Bank",
        acc: null,
        bal: "999.00",
      }),
    ];
    const dashboard = seedAndProject(messages, new Date(2000));
    expect(dashboard.banks[0]!.unassignedReadings).toHaveLength(1);

    const page = await queryUnassignedReadings({ bankName: "HDFC Bank" });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.accountId).toBeNull();
    expect(page.items[0]!.associationKind).toBe("unassigned");
  });

  it("excludes readings that did get attached to a confirmed account", async () => {
    useFreshDb();
    const messages = [
      sms("assigned-1", "VM-HDFCBK", 1000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        bal: "1000.00",
      }),
      sms("unassigned-1", "VM-HDFCBK", 2000, {
        bankName: "HDFC Bank",
        acc: null,
        bal: "999.00",
      }),
    ];
    seedAndProject(messages, new Date(3000));

    const page = await queryUnassignedReadings({ bankName: "HDFC Bank" });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.id).toBe("unassigned-1");
  });

  it("paginates with a keyset cursor the same way balance history does", async () => {
    useFreshDb();
    const messages = Array.from({ length: 3 }, (_, index) =>
      sms(`unassigned-${index}`, "VM-HDFCBK", 1000 + index * 1000, {
        bankName: "HDFC Bank",
        acc: null,
        bal: `${100 + index}.00`,
      }),
    );
    seedAndProject(messages, new Date(10000));

    const firstPage = await queryUnassignedReadings({ bankName: "HDFC Bank", limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await queryUnassignedReadings({
      bankName: "HDFC Bank",
      limit: 2,
      cursor: firstPage.nextCursor!,
    });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();
  });

  // Regression coverage for the bug the round-1 review found: dashboard.ts
  // groups unassignedReadingsByBank by normalizeBankName (trim + collapse
  // whitespace + lowercase), then displayBankName only trims/collapses
  // whitespace for the *displayed* name — so a raw parsed name like
  // "  STATE   BANK OF INDIA " renders as "STATE BANK OF INDIA" in the UI,
  // and a caller querying that exact displayed string against a
  // detected_bank_name-keyed lookup would get zero rows even though the
  // reading is right there. Querying by detectedBankKey (normalizeBankName
  // applied at both write and read time) is what makes this find it.
  it("finds a reading whose raw bank name has extra internal/leading/trailing whitespace, when queried by the normalized display name", async () => {
    useFreshDb();
    const messages = [
      sms("whitespace-1", "VM-SBIINB", 1000, {
        bankName: "  STATE   BANK OF INDIA ",
        acc: null,
        bal: "500.00",
      }),
    ];
    seedAndProject(messages, new Date(2000));

    // What the UI actually displays (dashboard.ts's displayBankName: trim +
    // collapse whitespace, no case change) — a real caller queries with
    // exactly this string, not the raw parsed one.
    const page = await queryUnassignedReadings({ bankName: "STATE BANK OF INDIA" });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.id).toBe("whitespace-1");
  });

  it("finds a reading whose raw bank name differs only in casing from the query", async () => {
    useFreshDb();
    const messages = [
      sms("casing-1", "VM-HDFCBK", 1000, {
        bankName: "hdfc bank",
        acc: null,
        bal: "500.00",
      }),
    ];
    seedAndProject(messages, new Date(2000));

    const page = await queryUnassignedReadings({ bankName: "HDFC Bank" });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.id).toBe("casing-1");
  });

  it("groups mixed-casing/whitespace variants of the same bank into one queryable result, not a partial one", async () => {
    useFreshDb();
    const messages = [
      sms("variant-1", "VM-HDFCBK", 1000, { bankName: "HDFC Bank", acc: null, bal: "100.00" }),
      sms("variant-2", "VM-HDFCBK", 2000, { bankName: "hdfc  bank", acc: null, bal: "200.00" }),
      sms("variant-3", "VM-HDFCBK", 3000, { bankName: "  HDFC BANK  ", acc: null, bal: "300.00" }),
    ];
    seedAndProject(messages, new Date(4000));

    const page = await queryUnassignedReadings({ bankName: "HDFC Bank" });
    // Without a canonical detectedBankKey, exact-match querying on the raw
    // detectedBankName would return only whichever variant string was
    // passed in — 1 of 3 — not the complete history for the real bank.
    expect(page.items).toHaveLength(3);
    expect(page.items.map((r) => r.id).sort()).toEqual(["variant-1", "variant-2", "variant-3"]);
  });

  it("paginates correctly across casing/whitespace variants of the same bank", async () => {
    useFreshDb();
    const variants = ["HDFC Bank", "hdfc bank", "  HDFC   BANK "];
    const messages = variants.map((bankName, index) =>
      sms(`paged-${index}`, "VM-HDFCBK", 1000 + index * 1000, {
        bankName,
        acc: null,
        bal: `${100 + index}.00`,
      }),
    );
    seedAndProject(messages, new Date(10000));

    const firstPage = await queryUnassignedReadings({ bankName: "HDFC Bank", limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await queryUnassignedReadings({
      bankName: "hdfc bank",
      limit: 2,
      cursor: firstPage.nextCursor!,
    });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();

    const seenIds = new Set([...firstPage.items, ...secondPage.items].map((r) => r.id));
    expect(seenIds.size).toBe(3);
  });
});

// Traces the exact SQL text better-sqlite3 actually executes, by wrapping
// Database.prototype.prepare — a real seam every drizzle query passes
// through, independent of decodeLedgerMessage's own error-swallowing
// try/catch (invalid JSON there is caught and ignored, not thrown, so a
// test that only asserted "resolves without throwing" would pass even if a
// query silently fell back to scanning and failing to decode the whole
// ledger). This proves no statement referencing sms_ledger was ever
// prepared, not just "no error was thrown."
interface TracedStatement {
  sqlText: string;
  params: unknown[];
}

type PrepareFn = (
  sqlText: string,
  ...rest: unknown[]
) => {
  all: (...params: unknown[]) => unknown;
  get: (...params: unknown[]) => unknown;
  run: (...params: unknown[]) => unknown;
};

// Wraps Database.prototype.prepare AND the returned statement's own
// all/get/run, since better-sqlite3 only receives bind values at call
// time, not at prepare() time — capturing prepare() alone would record the
// `?` placeholders with no way to re-run the exact same query later.
function traceExecutedSql(
  sqlite: Database.Database,
  run: () => Promise<void>,
): Promise<TracedStatement[]> {
  const statements: TracedStatement[] = [];
  const ctor = sqlite.constructor as unknown as { prototype: { prepare: PrepareFn } };
  const originalPrepare = ctor.prototype.prepare;
  ctor.prototype.prepare = function (this: unknown, sqlText: string, ...rest: unknown[]) {
    const statement = originalPrepare.apply(this, [sqlText, ...rest]) as Record<
      "all" | "get" | "run",
      (...args: unknown[]) => unknown
    >;
    // Patches the returned statement object in place (not a shallow copy)
    // — drizzle's better-sqlite3 driver calls prototype methods like
    // stmt.raw(...) that a `{ ...statement }` spread would silently drop,
    // since those live on the prototype, not as the instance's own
    // enumerable properties.
    for (const method of ["all", "get", "run"] as const) {
      const original = statement[method].bind(statement);
      statement[method] = (...params: unknown[]) => {
        statements.push({ sqlText, params });
        return original(...params);
      };
    }
    return statement;
  };
  return run()
    .then(() => statements)
    .finally(() => {
      ctor.prototype.prepare = originalPrepare;
    });
}

describe("account queries never load the raw ledger", () => {
  it("prepares no SQL statement that references sms_ledger for a normal account/balance-history read", async () => {
    useFreshDb();
    const messages = Array.from({ length: 200 }, (_, index) =>
      sms(`msg-${index}`, "VM-HDFCBK", 1000 + index, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        bal: `${1000 + index}.00`,
      }),
    );
    seedAndProject(messages, new Date(300000));
    const accountId = (await queryAccounts())[0]!.id;

    const statements = await traceExecutedSql(rawSqlite, async () => {
      await queryAccounts();
      await queryDetectedAccounts();
      await queryBalanceHistory({ accountId });
      await queryUnassignedReadings({ bankName: "HDFC Bank" });
    });

    expect(statements.length).toBeGreaterThan(0);
    expect(statements.some((statement) => /sms_ledger/i.test(statement.sqlText))).toBe(false);
  });
});

describe("query plans use an index, not a full scan or a temp sort", () => {
  // Captures the exact SQL text drizzle's own query builder generates for
  // a real call (via the same prepare seam traceExecutedSql uses), then
  // feeds that captured text — not a hand-copied approximation — into
  // EXPLAIN QUERY PLAN. This is what keeps the assertion honest if the
  // production query in queries-accounts.ts ever changes shape: a hand-
  // written SQL string here could stay green while the real generated
  // query silently regressed to a scan.
  // The real call also runs ensureDashboardProjectionCurrent() first, which
  // issues its own SELECT against projection_state — filtering by the
  // target table name (not just "the first SELECT seen") is what makes
  // this pick out the actual balance_readings query, not an unrelated one.
  async function planForRealCall(run: () => Promise<unknown>): Promise<string[]> {
    const statements = await traceExecutedSql(rawSqlite, async () => {
      await run();
    });
    const selectStatement = statements.find(
      (statement) =>
        /^select/i.test(statement.sqlText.trim()) &&
        /from "balance_readings"/i.test(statement.sqlText),
    );
    if (!selectStatement) {
      throw new Error(
        `Expected call to prepare a SELECT against balance_readings; saw: ${statements.map((s) => s.sqlText).join(" | ")}`,
      );
    }
    return rawSqlite
      .prepare(`EXPLAIN QUERY PLAN ${selectStatement.sqlText}`)
      .all(...selectStatement.params)
      .map((row) => (row as { detail: string }).detail);
  }

  it("queryBalanceHistory's real generated query is served by balance_readings_account_id_as_of_id_idx", async () => {
    useFreshDb();
    seedAndProject([], new Date(2000));

    const plan = await planForRealCall(() => queryBalanceHistory({ accountId: "hdfc bank|1234" }));

    expect(plan.some((line) => line.includes("balance_readings_account_id_as_of_id_idx"))).toBe(
      true,
    );
    expect(plan.some((line) => /SCAN balance_readings/i.test(line))).toBe(false);
    expect(plan.some((line) => /USE TEMP B-TREE/i.test(line))).toBe(false);
  });

  it("queryUnassignedReadings's real generated query is served by balance_readings_bank_key_account_as_of_id_idx", async () => {
    useFreshDb();
    seedAndProject([], new Date(2000));

    const plan = await planForRealCall(() => queryUnassignedReadings({ bankName: "HDFC Bank" }));

    expect(
      plan.some((line) => line.includes("balance_readings_bank_key_account_as_of_id_idx")),
    ).toBe(true);
    expect(plan.some((line) => /SCAN balance_readings/i.test(line))).toBe(false);
    expect(plan.some((line) => /USE TEMP B-TREE/i.test(line))).toBe(false);
  });

  // Control check: a query with the same predicate but no ORDER BY at all
  // should still find the index for the WHERE clause — proving the
  // previous two assertions are actually sensitive to the real index
  // existing, not vacuously true for any query against this table.
  it("control: a predicate-only query (no keyset order) still finds the composite index's leading columns", () => {
    useFreshDb();
    seedAndProject([], new Date(2000));

    const plan = rawSqlite
      .prepare(`EXPLAIN QUERY PLAN SELECT id FROM balance_readings WHERE account_id = ?`)
      .all("hdfc bank|1234")
      .map((row) => (row as { detail: string }).detail);
    expect(plan.some((line) => line.includes("balance_readings_account_id_as_of_id_idx"))).toBe(
      true,
    );
  });
});
