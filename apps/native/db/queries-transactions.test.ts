// Tests db/queries-transactions.ts against a real SQLite database (better-
// sqlite3, same approach as db/queries-accounts.test.ts) — proving the
// SQL/keyset pagination and single-row-detail-join behavior, not mocking
// drizzle. Seeds via replaceProjection (deriveDashboardProjection →
// projections.ts), same as the rest of the db/*.test.ts suite, so
// fixtures go through the exact write path production uses.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import { describe, it, expect, vi } from "vitest";
import type { MalanaResult } from "@zeeya/parser/malana";
import { deriveDashboardProjection } from "../lib/dashboard";
import type { ParsedSms } from "../lib/sms";
import { replaceProjection } from "./projections";
import * as schema from "./schema";
import { initializeNativeDatabase } from "./native-init";
import { asyncSqlite } from "./testing/async-sqlite";

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
// module so both queries-transactions.ts's and ingestion.ts's
// (transitively, via ensureDashboardProjectionCurrent) `import { db } from
// "./client"` resolve to this test's in-memory better-sqlite3 instance.
vi.mock("./client", () => ({
  get db() {
    return testDb;
  },
  get sqlite() {
    return rawSqlite ? asyncSqlite(rawSqlite) : null;
  },
}));

const { queryActivityDetail, queryActivityPage, queryTransactionDetail } =
  await import("./queries-transactions");

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
  return { id, sender, body: "raw sms body should never be returned", date, result: result(r) };
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

describe("queryTransactionDetail", () => {
  // This message is financial (has trx + trxTypeRich, so projectTransaction
  // does create a transactions row) and happens to also carry travel
  // fields — proving the allowlist join works, but NOT proving a pure
  // non-financial message (no trx/trxTypeRich at all, so no transactions
  // row exists) can be looked up here. It can't — see queryActivityDetail
  // below, which is what a purely non-financial activity item (travel/
  // delivery/OTP/event/offer) must be looked up through instead.
  it("returns the requested transaction only, including a category-specific field only in the ledger's parsed_result", async () => {
    useFreshDb();
    const messages = [
      sms("trx-1", "VM-HDFCBK", 1000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "500.00",
        trxTypeRich: "EXPENSE",
        pnr: "ABC123",
        flight: "AI202",
      }),
      sms("trx-2", "VM-HDFCBK", 2000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "700.00",
        trxTypeRich: "EXPENSE",
      }),
    ];
    seedAndProject(messages, new Date(3000));

    const detail = await queryTransactionDetail("trx-1");
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe("trx-1");
    expect(detail!.pnr).toBe("ABC123");
    expect(detail!.flight).toBe("AI202");
  });

  it("returns null for a nonexistent transaction id, not an error", async () => {
    useFreshDb();
    seedAndProject([], new Date(2000));
    expect(await queryTransactionDetail("does-not-exist")).toBeNull();
  });

  it("never returns the raw SMS body, grammar tags, or token tree", async () => {
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

    const detail = await queryTransactionDetail("trx-1");
    expect(detail).not.toBeNull();
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain("raw sms body should never be returned");
    expect(Object.prototype.hasOwnProperty.call(detail, "tags")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(detail, "tokens")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(detail, "body")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(detail, "categoryMatches")).toBe(false);
  });

  it("resolves category-specific fields to null, without throwing, when parsed_result is corrupt JSON", async () => {
    useFreshDb();
    const messages = [
      sms("trx-1", "VM-HDFCBK", 1000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "500.00",
        trxTypeRich: "EXPENSE",
        pnr: "ABC123",
      }),
    ];
    seedAndProject(messages, new Date(2000));
    testDb.run(sql`UPDATE sms_ledger SET parsed_result = 'not valid json' WHERE id = 'trx-1'`);

    const detail = await queryTransactionDetail("trx-1");
    expect(detail).not.toBeNull();
    // The transactions-table-sourced fields still resolve correctly — only
    // the ledger-JSON-sourced ones fall back to null.
    expect(detail!.id).toBe("trx-1");
    expect(detail!.amountMinorUnits).toBe(50000);
    expect(detail!.pnr).toBeNull();
  });

  it("resolves category-specific fields to null, without throwing, when parsed_result fails schema validation", async () => {
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
    // Valid JSON, but not a MalanaResult at all — parsePersistedMalanaResult
    // must reject this via schema validation, not just JSON.parse succeeding.
    testDb.run(
      sql`UPDATE sms_ledger SET parsed_result = '{"unexpected":"shape"}' WHERE id = 'trx-1'`,
    );

    const detail = await queryTransactionDetail("trx-1");
    expect(detail).not.toBeNull();
    expect(detail!.pnr).toBeNull();
    expect(detail!.otp).toBeNull();
  });

  it("resolves category-specific fields to null, without throwing, when parsed_result is missing", async () => {
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
    // The parsed_result/ingestion_status CHECK requires parsed_result
    // non-null when status='parsed' — simulate the "missing" case the only
    // way the schema allows, by flipping status to 'error'.
    testDb.run(
      sql`UPDATE sms_ledger SET parsed_result = NULL, ingestion_status = 'error', ingestion_error = 'test' WHERE id = 'trx-1'`,
    );

    const detail = await queryTransactionDetail("trx-1");
    expect(detail).not.toBeNull();
    expect(detail!.pnr).toBeNull();
  });

  it("reports isFromCard/isOnlineBrand as null (unknown), never false, when ledger detail is unavailable", async () => {
    useFreshDb();
    const messages = [
      sms("trx-1", "VM-HDFCBK", 1000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "500.00",
        trxTypeRich: "EXPENSE",
        isFromCard: true,
        isOnlineBrand: true,
      }),
    ];
    seedAndProject(messages, new Date(2000));
    testDb.run(sql`UPDATE sms_ledger SET parsed_result = 'not valid json' WHERE id = 'trx-1'`);

    const detail = await queryTransactionDetail("trx-1");
    expect(detail).not.toBeNull();
    // The real parsed values were true/true — corrupting the ledger row
    // afterward must produce null (unknown), never a false that would
    // misreport "confirmed not from a card."
    expect(detail!.isFromCard).toBeNull();
    expect(detail!.isOnlineBrand).toBeNull();
  });

  it("reports isFromCard/isOnlineBrand as their real false value when the parser said no, distinct from unknown", async () => {
    useFreshDb();
    const messages = [
      sms("trx-1", "VM-HDFCBK", 1000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "500.00",
        trxTypeRich: "EXPENSE",
        isFromCard: false,
        isOnlineBrand: false,
      }),
    ];
    seedAndProject(messages, new Date(2000));

    const detail = await queryTransactionDetail("trx-1");
    expect(detail).not.toBeNull();
    expect(detail!.isFromCard).toBe(false);
    expect(detail!.isOnlineBrand).toBe(false);
  });
});

describe("queryActivityPage", () => {
  it("filters by category in SQL", async () => {
    useFreshDb();
    const messages = [
      sms("travel-1", "VM-TEST", 1000, {
        category: "GRM_TRAVEL",
        matchedCategories: ["GRM_TRAVEL"],
        pnr: "X",
      }),
      sms("delivery-1", "VM-TEST", 2000, {
        category: "GRM_DELIVERY",
        matchedCategories: ["GRM_DELIVERY"],
        orderNo: "Y",
      }),
    ];
    seedAndProject(messages, new Date(3000));

    const page = await queryActivityPage({ category: "GRM_TRAVEL" });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.id).toBe("travel-1|GRM_TRAVEL");
    expect(page.items[0]!.category).toBe("GRM_TRAVEL");
  });

  it("filters by date range in SQL", async () => {
    useFreshDb();
    const messages = Array.from({ length: 5 }, (_, index) =>
      sms(`travel-${index}`, "VM-TEST", 1000 + index * 1000, {
        category: "GRM_TRAVEL",
        matchedCategories: ["GRM_TRAVEL"],
      }),
    );
    seedAndProject(messages, new Date(10000));

    const page = await queryActivityPage({ from: 2000, to: 4000 });
    expect(page.items.map((i) => i.id).sort()).toEqual(
      ["travel-1|GRM_TRAVEL", "travel-2|GRM_TRAVEL", "travel-3|GRM_TRAVEL"].sort(),
    );
  });

  it("carries the financial fields for a transaction-backed activity row, and nulls for a non-financial one", async () => {
    useFreshDb();
    const messages = [
      sms("bank-1", "VM-HDFCBK", 1000, {
        category: "GRM_BANK",
        matchedCategories: ["GRM_BANK"],
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "500.00",
        trxTypeRich: "EXPENSE",
      }),
      sms("travel-1", "VM-TEST", 2000, {
        category: "GRM_TRAVEL",
        matchedCategories: ["GRM_TRAVEL"],
      }),
    ];
    seedAndProject(messages, new Date(3000));

    const bankPage = await queryActivityPage({ category: "GRM_BANK" });
    expect(bankPage.items[0]!.amountMinorUnits).toBe(50000);
    expect(bankPage.items[0]!.direction).toBe("expense");

    const travelPage = await queryActivityPage({ category: "GRM_TRAVEL" });
    expect(travelPage.items[0]!.amountMinorUnits).toBeNull();
    expect(travelPage.items[0]!.currency).toBeNull();
    expect(travelPage.items[0]!.direction).toBeNull();
  });

  it("orders newest-first and paginates with a stable keyset cursor", async () => {
    useFreshDb();
    const messages = Array.from({ length: 5 }, (_, index) =>
      sms(`travel-${index}`, "VM-TEST", 1000 + index * 1000, {
        category: "GRM_TRAVEL",
        matchedCategories: ["GRM_TRAVEL"],
      }),
    );
    seedAndProject(messages, new Date(10000));

    const firstPage = await queryActivityPage({ limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.items[0]!.date).toBeGreaterThan(firstPage.items[1]!.date);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await queryActivityPage({ limit: 2, cursor: firstPage.nextCursor! });
    expect(secondPage.items).toHaveLength(2);

    const thirdPage = await queryActivityPage({ limit: 2, cursor: secondPage.nextCursor! });
    expect(thirdPage.items).toHaveLength(1);
    expect(thirdPage.nextCursor).toBeNull();

    const seenIds = new Set(
      [...firstPage.items, ...secondPage.items, ...thirdPage.items].map((i) => i.id),
    );
    expect(seenIds.size).toBe(5);
  });

  it("does not skip or duplicate rows that share the exact same date", async () => {
    useFreshDb();
    const messages = [
      sms("same-time-a", "VM-TEST", 5000, {
        category: "GRM_TRAVEL",
        matchedCategories: ["GRM_TRAVEL"],
      }),
      sms("same-time-b", "VM-TEST", 5000, {
        category: "GRM_TRAVEL",
        matchedCategories: ["GRM_TRAVEL"],
      }),
    ];
    seedAndProject(messages, new Date(10000));

    const firstPage = await queryActivityPage({ limit: 1 });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await queryActivityPage({ limit: 1, cursor: firstPage.nextCursor! });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]!.id).not.toBe(firstPage.items[0]!.id);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("rejects a limit outside the valid range instead of silently clamping", async () => {
    useFreshDb();
    seedAndProject([], new Date(2000));
    await expect(queryActivityPage({ limit: 0 })).rejects.toThrow(/limit/i);
    await expect(queryActivityPage({ limit: 101 })).rejects.toThrow(/limit/i);
    await expect(queryActivityPage({ limit: 1.5 })).rejects.toThrow(/limit/i);
  });

  it("returns an empty page, not an error, when nothing matches", async () => {
    useFreshDb();
    seedAndProject([], new Date(2000));
    const page = await queryActivityPage({ category: "GRM_TRAVEL" });
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it("never returns a raw ParsedSms or SMS body for a list row", async () => {
    useFreshDb();
    const messages = [
      sms("travel-1", "VM-TEST", 1000, {
        category: "GRM_TRAVEL",
        matchedCategories: ["GRM_TRAVEL"],
      }),
    ];
    seedAndProject(messages, new Date(2000));

    const page = await queryActivityPage({});
    const serialized = JSON.stringify(page);
    expect(serialized).not.toContain("raw sms body should never be returned");
  });
});

describe("queryActivityDetail", () => {
  it("finds a pure non-financial activity item (no trx/trxTypeRich, so no transactions row exists at all)", async () => {
    useFreshDb();
    const messages = [
      sms("travel-1", "VM-TEST", 1000, {
        category: "GRM_TRAVEL",
        matchedCategories: ["GRM_TRAVEL"],
        pnr: "ABC123",
        flight: "AI202",
      }),
    ];
    seedAndProject(messages, new Date(2000));

    // Confirms the gap this query exists to close: the same message is
    // genuinely absent from transactions.get, because projectTransaction
    // requires both trx and trxTypeRich and this message has neither.
    expect(await queryTransactionDetail("travel-1")).toBeNull();

    const detail = await queryActivityDetail("travel-1|GRM_TRAVEL");
    expect(detail).not.toBeNull();
    expect(detail!.pnr).toBe("ABC123");
    expect(detail!.flight).toBe("AI202");
    expect(detail!.transactionId).toBeNull();
    expect(detail!.accountId).toBeNull();
    expect(detail!.amountMinorUnits).toBeNull();
  });

  it("carries transactionId/accountId/ref for a financial activity item, left-joined by the shared smsId", async () => {
    useFreshDb();
    const messages = [
      sms("bank-1", "VM-HDFCBK", 1000, {
        category: "GRM_BANK",
        matchedCategories: ["GRM_BANK"],
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "500.00",
        trxTypeRich: "EXPENSE",
        ref: "REF999",
      }),
    ];
    seedAndProject(messages, new Date(2000));

    const detail = await queryActivityDetail("bank-1|GRM_BANK");
    expect(detail).not.toBeNull();
    expect(detail!.transactionId).toBe("bank-1");
    expect(detail!.ref).toBe("REF999");
    expect(detail!.amountMinorUnits).toBe(50000);
  });

  it("returns null for a nonexistent activity id, not an error", async () => {
    useFreshDb();
    seedAndProject([], new Date(2000));
    expect(await queryActivityDetail("does-not-exist|GRM_TRAVEL")).toBeNull();
  });

  it("never returns the raw SMS body, grammar tags, or token tree", async () => {
    useFreshDb();
    const messages = [
      sms("travel-1", "VM-TEST", 1000, {
        category: "GRM_TRAVEL",
        matchedCategories: ["GRM_TRAVEL"],
        pnr: "ABC123",
      }),
    ];
    seedAndProject(messages, new Date(2000));

    const detail = await queryActivityDetail("travel-1|GRM_TRAVEL");
    expect(detail).not.toBeNull();
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain("raw sms body should never be returned");
    expect(Object.prototype.hasOwnProperty.call(detail, "tags")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(detail, "tokens")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(detail, "body")).toBe(false);
  });

  it("resolves category-specific fields to null, without throwing, when parsed_result is corrupt JSON", async () => {
    useFreshDb();
    const messages = [
      sms("travel-1", "VM-TEST", 1000, {
        category: "GRM_TRAVEL",
        matchedCategories: ["GRM_TRAVEL"],
        pnr: "ABC123",
      }),
    ];
    seedAndProject(messages, new Date(2000));
    testDb.run(sql`UPDATE sms_ledger SET parsed_result = 'not valid json' WHERE id = 'travel-1'`);

    const detail = await queryActivityDetail("travel-1|GRM_TRAVEL");
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe("travel-1|GRM_TRAVEL");
    expect(detail!.pnr).toBeNull();
  });

  it("reports isFromCard from the activity row's own presentation column, not the (possibly unavailable) ledger JSON", async () => {
    useFreshDb();
    const messages = [
      sms("bank-1", "VM-HDFCBK", 1000, {
        category: "GRM_BANK",
        matchedCategories: ["GRM_BANK"],
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "500.00",
        trxTypeRich: "EXPENSE",
        isFromCard: true,
      }),
    ];
    seedAndProject(messages, new Date(2000));
    testDb.run(sql`UPDATE sms_ledger SET parsed_result = 'not valid json' WHERE id = 'bank-1'`);

    const detail = await queryActivityDetail("bank-1|GRM_BANK");
    expect(detail).not.toBeNull();
    // Written once at projection time from the real (then-valid) parser
    // result — corrupting the ledger row afterward must not turn this
    // real, already-known true into an "unknown" null.
    expect(detail!.isFromCard).toBe(true);
  });
});

describe("query plans use an index, not a full scan or a temp sort", () => {
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

  async function planForRealCall(
    run: () => Promise<unknown>,
    tableName: string,
  ): Promise<string[]> {
    const statements = await traceExecutedSql(rawSqlite, async () => {
      await run();
    });
    const selectStatement = statements.find(
      (statement) =>
        /^select/i.test(statement.sqlText.trim()) &&
        new RegExp(`from "${tableName}"`, "i").test(statement.sqlText),
    );
    if (!selectStatement) {
      throw new Error(
        `Expected call to prepare a SELECT against ${tableName}; saw: ${statements.map((s) => s.sqlText).join(" | ")}`,
      );
    }
    return rawSqlite
      .prepare(`EXPLAIN QUERY PLAN ${selectStatement.sqlText}`)
      .all(...selectStatement.params)
      .map((row) => (row as { detail: string }).detail);
  }

  it("queryActivityPage's real generated query is served by activity_category_date_id_idx", async () => {
    useFreshDb();
    seedAndProject([], new Date(2000));

    const plan = await planForRealCall(
      () => queryActivityPage({ category: "GRM_TRAVEL" }),
      "activity",
    );

    expect(plan.some((line) => line.includes("activity_category_date_id_idx"))).toBe(true);
    expect(plan.some((line) => /SCAN activity/i.test(line))).toBe(false);
    expect(plan.some((line) => /USE TEMP B-TREE/i.test(line))).toBe(false);
  });

  // The composite (category, date, id) index above can't serve a query
  // with no category equality predicate — its category column is the
  // leading key. This is the exact regression the review caught: the
  // real unfiltered production query (financeDataSource.activity.list({})
  // — the default, no-filter case) was scanning the whole table and
  // building a temp b-tree to sort it, before activity_date_id_idx existed.
  it("queryActivityPage's real unfiltered ({}) generated query is served by activity_date_id_idx, not a raw table scan or a temp sort", async () => {
    useFreshDb();
    seedAndProject([], new Date(2000));

    const plan = await planForRealCall(() => queryActivityPage({}), "activity");

    // With no WHERE predicate at all, SQLite's own EXPLAIN QUERY PLAN
    // correctly reports "SCAN activity USING INDEX activity_date_id_idx" —
    // "SCAN" here means "walk in index order" (there's nothing to seek to
    // without a predicate), not "scan the raw table b-tree". The real
    // regression this test guards against is walking the table's own
    // rowid order and needing a separate temp b-tree to sort it — i.e. a
    // SCAN with no "USING INDEX" naming this index at all.
    expect(plan.some((line) => line.includes("activity_date_id_idx"))).toBe(true);
    expect(
      plan.some((line) => /SCAN activity\b/i.test(line) && !line.includes("activity_date_id_idx")),
    ).toBe(false);
    expect(plan.some((line) => /USE TEMP B-TREE/i.test(line))).toBe(false);
  });

  // Insights' recent-transactions list. Before
  // transactions_currency_direction_date_id_idx this was a full SCAN of
  // transactions plus a temp b-tree sort on every Analytics visit.
  it("queryTransactionPage's real generated query seeks the currency/direction index with no sort", async () => {
    useFreshDb();
    seedAndProject([], new Date(2000));
    const { queryTransactionPage } = await import("./ingestion");

    const plan = await planForRealCall(
      () => queryTransactionPage({ currency: "INR", direction: "expense", limit: 25 }),
      "transactions",
    );

    expect(plan.some((line) => line.includes("transactions_currency_direction_date_id_idx"))).toBe(
      true,
    );
    expect(plan.some((line) => /SCAN transactions\b/i.test(line) && !line.includes("INDEX"))).toBe(
      false,
    );
    expect(plan.some((line) => /USE TEMP B-TREE/i.test(line))).toBe(false);
  });

  it("queryTransactionDetail's lookup is a single-row seek by primary key, not a scan", async () => {
    useFreshDb();
    seedAndProject([], new Date(2000));

    const plan = await planForRealCall(() => queryTransactionDetail("trx-1"), "transactions");

    expect(plan.some((line) => /SCAN transactions/i.test(line))).toBe(false);
  });

  it("queryActivityDetail's lookup is a single-row seek by primary key, not a scan", async () => {
    useFreshDb();
    seedAndProject([], new Date(2000));

    const plan = await planForRealCall(
      () => queryActivityDetail("does-not-exist|GRM_TRAVEL"),
      "activity",
    );

    expect(plan.some((line) => /SCAN activity/i.test(line))).toBe(false);
  });

  // Control check: a query with the same predicate but no ORDER BY at all
  // should still find the index for the WHERE clause — proving the
  // previous assertion is actually sensitive to the real index existing.
  it("control: a predicate-only query (no keyset order) still finds the composite index's leading columns", () => {
    useFreshDb();
    seedAndProject([], new Date(2000));

    const plan = rawSqlite
      .prepare(`EXPLAIN QUERY PLAN SELECT id FROM activity WHERE category = ?`)
      .all("GRM_TRAVEL")
      .map((row) => (row as { detail: string }).detail);
    expect(plan.some((line) => line.includes("activity_category_date_id_idx"))).toBe(true);
  });
});
