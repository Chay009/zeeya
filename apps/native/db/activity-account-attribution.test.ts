// Projection + query integration for activity.account_id — proves the SQL
// path matches lib/activity-account-attribution.ts and the legacy UI rule.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MalanaResult } from "@zeeya/parser/malana";
import {
  legacyActivityMatchesAccount,
  resolveActivityAccountId,
  toActivityAccountAttributionCandidate,
} from "../lib/activity-account-attribution";
import { deriveDashboardProjection } from "../lib/dashboard";
import type { ParsedSms } from "../lib/sms";
import { initializeNativeDatabase } from "./native-init";
import { replaceProjection } from "./projections";
import type { AsyncQueryClient } from "./queries";
import * as schema from "./schema";

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

function seedLedger(db: ReturnType<typeof freshDb>["drizzleDb"], messages: ParsedSms[]) {
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
}

function project(db: ReturnType<typeof freshDb>["drizzleDb"], messages: ParsedSms[], now: Date) {
  seedLedger(db, messages);
  replaceProjection(db, deriveDashboardProjection(messages, now));
}

let rawSqlite: Database.Database;
let testDb: ReturnType<typeof freshDb>["drizzleDb"];
let client: AsyncQueryClient;
let queryHomeRecentActivity: typeof import("./queries-home").queryHomeRecentActivity;

vi.mock("./client", () => ({
  get db() {
    return testDb;
  },
  get sqlite() {
    return rawSqlite
      ? {
          getAllAsync: async <T>(source: string, params: unknown[]) =>
            rawSqlite.prepare(source).all(...params) as T[],
        }
      : null;
  },
}));

afterEach(() => {
  if (rawSqlite?.open) rawSqlite.close();
});

async function useFreshDb() {
  const fresh = freshDb();
  rawSqlite = fresh.sqlite;
  testDb = fresh.drizzleDb;
  client = asyncClientFor(fresh.sqlite);
  ({ queryHomeRecentActivity } = await import("./queries-home"));
}

describe("activity.account_id projection", () => {
  it("projects exact bank + last4 matches onto activity rows", async () => {
    await useFreshDb();
    project(
      testDb,
      [
        sms("balance-1111", "VM-TEST", 1000, {
          bankName: "Test Bank",
          bal: "1000.00",
          acc: "XX1111",
          matchedCategories: ["GRM_BANK"],
        }),
        sms("balance-2222", "VM-TEST", 1001, {
          bankName: "Test Bank",
          bal: "2000.00",
          acc: "XX2222",
          matchedCategories: ["GRM_BANK"],
        }),
        sms("expense-2222", "VM-TEST", 2000, {
          bankName: "Test Bank",
          acc: "XX2222",
          trx: "50.00",
          trxTypeRich: "EXPENSE",
          matchedCategories: ["GRM_BANK"],
        }),
      ],
      new Date(3000),
    );

    const row = testDb
      .select()
      .from(schema.activity)
      .where(eq(schema.activity.smsId, "expense-2222"))
      .get();
    expect(row?.accountId).toBe("test bank|2222");
  });

  it("leaves ambiguous no-last4 messages unassigned when two accounts share a bank", async () => {
    await useFreshDb();
    project(
      testDb,
      [
        sms("balance-1111", "VM-TEST", 1000, {
          bankName: "Test Bank",
          bal: "1000.00",
          acc: "XX1111",
          matchedCategories: ["GRM_BANK"],
        }),
        sms("balance-2222", "VM-TEST", 1001, {
          bankName: "Test Bank",
          bal: "2000.00",
          acc: "XX2222",
          matchedCategories: ["GRM_BANK"],
        }),
        sms("expense-ambiguous", "VM-TEST", 2000, {
          bankName: "Test Bank",
          trx: "50.00",
          trxTypeRich: "EXPENSE",
          matchedCategories: ["GRM_BANK"],
        }),
      ],
      new Date(3000),
    );

    const row = testDb
      .select()
      .from(schema.activity)
      .where(eq(schema.activity.smsId, "expense-ambiguous"))
      .get();
    expect(row?.accountId).toBeNull();
  });

  it("rebuilds away a sole-account assignment once a second account appears", async () => {
    await useFreshDb();
    const soleAccountMessages: ParsedSms[] = [
      sms("balance-1111", "VM-TEST", 1000, {
        bankName: "Test Bank",
        bal: "1000.00",
        acc: "XX1111",
        matchedCategories: ["GRM_BANK"],
      }),
      sms("expense-no-acc", "VM-TEST", 2000, {
        bankName: "Test Bank",
        trx: "50.00",
        trxTypeRich: "EXPENSE",
        matchedCategories: ["GRM_BANK"],
      }),
    ];
    project(testDb, soleAccountMessages, new Date(3000));

    const before = testDb
      .select()
      .from(schema.activity)
      .where(eq(schema.activity.smsId, "expense-no-acc"))
      .get();
    expect(before?.accountId).toBe("test bank|1111");

    const expandedMessages = [
      ...soleAccountMessages,
      sms("balance-2222", "VM-TEST", 1001, {
        bankName: "Test Bank",
        bal: "2000.00",
        acc: "XX2222",
        matchedCategories: ["GRM_BANK"],
      }),
    ];
    seedLedger(testDb, [expandedMessages[expandedMessages.length - 1]!]);
    replaceProjection(testDb, deriveDashboardProjection(expandedMessages, new Date(4000)));

    const after = testDb
      .select()
      .from(schema.activity)
      .where(eq(schema.activity.smsId, "expense-no-acc"))
      .get();
    expect(after?.accountId).toBeNull();
  });
});

describe("account-scoped activity query", () => {
  it("returns only rows for the requested account_id", async () => {
    await useFreshDb();
    project(
      testDb,
      [
        sms("balance-1111", "VM-TEST", 1000, {
          bankName: "Test Bank",
          bal: "1000.00",
          acc: "XX1111",
          matchedCategories: ["GRM_BANK"],
        }),
        sms("balance-2222", "VM-TEST", 1001, {
          bankName: "Test Bank",
          bal: "2000.00",
          acc: "XX2222",
          matchedCategories: ["GRM_BANK"],
        }),
        sms("expense-1111", "VM-TEST", 2000, {
          bankName: "Test Bank",
          acc: "XX1111",
          trx: "50.00",
          trxTypeRich: "EXPENSE",
          matchedCategories: ["GRM_BANK"],
        }),
        sms("expense-2222", "VM-TEST", 2001, {
          bankName: "Test Bank",
          acc: "XX2222",
          trx: "75.00",
          trxTypeRich: "EXPENSE",
          matchedCategories: ["GRM_BANK"],
        }),
      ],
      new Date(5000),
    );

    const rows = await queryHomeRecentActivity(
      { accountId: "test bank|1111", limit: 10 },
      client,
    );
    expect(rows.map((row) => row.smsId)).toEqual(["expense-1111", "balance-1111"]);
    expect(rows.every((row) => row.accountId === "test bank|1111")).toBe(true);
  });

  it("uses the activity_account_id_date_id_idx composite index", async () => {
    await useFreshDb();
    project(
      testDb,
      [
        sms("balance-1111", "VM-TEST", 1000, {
          bankName: "Test Bank",
          bal: "1000.00",
          acc: "XX1111",
          matchedCategories: ["GRM_BANK"],
        }),
        sms("expense-1111", "VM-TEST", 2000, {
          bankName: "Test Bank",
          acc: "XX1111",
          trx: "50.00",
          trxTypeRich: "EXPENSE",
          matchedCategories: ["GRM_BANK"],
        }),
      ],
      new Date(3000),
    );

    const plan = rawSqlite
      .prepare(
        `EXPLAIN QUERY PLAN SELECT sms_id AS smsId, date
         FROM activity
         WHERE account_id = ?
         ORDER BY date DESC, id DESC
         LIMIT ?`,
      )
      .all("test bank|1111", 50)
      .map((row) => (row as { detail: string }).detail);

    expect(plan.some((line) => line.includes("activity_account_id_date_id_idx"))).toBe(true);
    expect(plan.some((line) => /TEMP B-TREE.*ORDER BY/i.test(line))).toBe(false);
  });

  it("matches the legacy matchesAccount filter for equivalent fixtures", async () => {
    await useFreshDb();
    const messages = [
      sms("balance-1111", "VM-TEST", 1000, {
        bankName: "Test Bank",
        bal: "1000.00",
        acc: "XX1111",
        matchedCategories: ["GRM_BANK"],
      }),
      sms("balance-2222", "VM-TEST", 1001, {
        bankName: "Test Bank",
        bal: "2000.00",
        acc: "XX2222",
        matchedCategories: ["GRM_BANK"],
      }),
      sms("expense-1111", "VM-TEST", 2000, {
        bankName: "Test Bank",
        acc: "XX1111",
        trx: "50.00",
        trxTypeRich: "EXPENSE",
        matchedCategories: ["GRM_BANK"],
      }),
      sms("expense-2222", "VM-TEST", 2001, {
        bankName: "Test Bank",
        acc: "XX2222",
        trx: "75.00",
        trxTypeRich: "EXPENSE",
        matchedCategories: ["GRM_BANK"],
      }),
      sms("expense-ambiguous", "VM-TEST", 2002, {
        bankName: "Test Bank",
        trx: "10.00",
        trxTypeRich: "EXPENSE",
        matchedCategories: ["GRM_BANK"],
      }),
    ];
    project(testDb, messages, new Date(6000));

    const messageBySmsId = new Map(messages.map((message) => [message.id, message]));
    const allRows = await queryHomeRecentActivity({ limit: 20 }, client);
    const accounts = [
      { key: "test bank|1111", bankName: "Test Bank", last4: "1111", currency: "INR" },
      { key: "test bank|2222", bankName: "Test Bank", last4: "2222", currency: "INR" },
    ];

    for (const account of accounts) {
      const sqlScoped = await queryHomeRecentActivity({ accountId: account.key, limit: 20 }, client);
      const legacyMatches = allRows.filter((row) => {
        const message = messageBySmsId.get(row.smsId);
        if (!message) return false;
        return legacyActivityMatchesAccount(
          {
            bankName: message.result.bankName,
            accountLast4: message.result.acc,
            currency: message.result.currency,
          },
          account,
          accounts,
        );
      });
      expect(sqlScoped.map((row) => row.smsId).sort()).toEqual(
        legacyMatches.map((row) => row.smsId).sort(),
      );
    }
  });

  it("projects account_id from the shared resolver for every activity message", async () => {
    await useFreshDb();
    const messages = [
      sms("balance-1111", "VM-TEST", 1000, {
        bankName: "Test Bank",
        bal: "1000.00",
        acc: "XX1111",
        matchedCategories: ["GRM_BANK"],
      }),
      sms("expense-1111", "VM-TEST", 2000, {
        bankName: "Test Bank",
        acc: "XX1111",
        trx: "50.00",
        trxTypeRich: "EXPENSE",
        matchedCategories: ["GRM_BANK"],
      }),
    ];
    const projection = deriveDashboardProjection(messages, new Date(3000));
    project(testDb, messages, new Date(3000));

    const candidates = projection.dashboard.accounts.map((account) =>
      toActivityAccountAttributionCandidate(
        account,
        `${account.bankName.trim().replace(/\s+/g, " ").toLowerCase()}|${account.last4}`,
      ),
    );

    for (const message of projection.dashboard.activity) {
      const expected = resolveActivityAccountId(
        message.result.bankName,
        message.result.acc,
        message.result.currency,
        candidates,
      );
      const rows = testDb
        .select()
        .from(schema.activity)
        .where(eq(schema.activity.smsId, message.id))
        .all();
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.accountId === expected)).toBe(true);
    }
  });
});
