// Tests db/queries-mandates.ts against a real SQLite database (better-
// sqlite3, same approach as db/queries-accounts.test.ts) — proving the
// SQL/keyset pagination behavior, not mocking drizzle. Seeds via
// replaceProjection (deriveDashboardProjection → projections.ts), same as
// the rest of the db/*.test.ts suite, so fixtures go through the exact
// write path production uses.
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
// module so both queries-mandates.ts's and ingestion.ts's (transitively,
// via ensureDashboardProjectionCurrent) `import { db } from "./client"`
// resolve to this test's in-memory better-sqlite3 instance instead.
vi.mock("./client", () => ({
  get db() {
    return testDb;
  },
  get sqlite() {
    return rawSqlite ? asyncSqlite(rawSqlite) : null;
  },
}));

const { queryMandate, queryMandateEvents, queryMandateEventsForMandates, queryMandates } =
  await import("./queries-mandates");

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
  return projection.dashboard;
}

function mandateMessage(
  id: string,
  date: number,
  overrides: Partial<MalanaResult> = {},
): ParsedSms {
  return sms(id, "VM-HDFCBK", date, {
    bankName: "HDFC Bank",
    acc: "XX1234",
    mandateId: "UMN123456789",
    mandateMerchant: "Netflix",
    mandateAmount: "499.00",
    mandateEvent: "active",
    ...overrides,
  });
}

describe("queryMandate", () => {
  it("reads one mandate by id — the same row the list returns — or null", async () => {
    useFreshDb();
    seedAndProject(
      [
        mandateMessage("mandate-1", 1000),
        mandateMessage("mandate-2", 1500, { mandateId: "UMN999", mandateMerchant: "Spotify" }),
      ],
      new Date(2000),
    );

    const listed = (await queryMandates()).items.find((item) => item.mandateId === "UMN999");
    expect(await queryMandate("UMN999")).toEqual(listed);
    expect(await queryMandate("UMN-missing")).toBeNull();
  });
});

describe("queryMandates", () => {
  it("returns a confirmed mandate's summary fields", async () => {
    useFreshDb();
    const messages = [mandateMessage("mandate-1", 1000)];
    seedAndProject(messages, new Date(2000));

    const page = await queryMandates();
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      mandateId: "UMN123456789",
      merchant: "Netflix",
      currency: "INR",
      status: "active",
      sender: "VM-HDFCBK",
    });
    expect(page.items[0]!.amountMinorUnits).toBe(49900);
    expect(page.nextCursor).toBeNull();
  });

  it("reflects the latest status across multiple mandate-context messages", async () => {
    useFreshDb();
    const messages = [
      mandateMessage("mandate-1", 1000, { mandateEvent: "active" }),
      mandateMessage("mandate-2", 2000, { mandateEvent: "cancelled" }),
    ];
    seedAndProject(messages, new Date(3000));

    const page = await queryMandates();
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.status).toBe("cancelled");
  });

  it("returns an empty page, not an error, when no mandates exist", async () => {
    useFreshDb();
    seedAndProject([], new Date(2000));
    const page = await queryMandates();
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it("keeps mandates and inferred subscriptions separate — a mandate-backed recurring payment never appears as a subscription", async () => {
    useFreshDb();
    const messages = Array.from({ length: 4 }, (_, index) =>
      mandateMessage(`mandate-${index}`, 1000 + index * 30 * 24 * 60 * 60 * 1000),
    );
    const dashboard = seedAndProject(messages, new Date(messages.at(-1)!.date));
    expect(dashboard.subscriptions).toHaveLength(0);

    const page = await queryMandates();
    expect(page.items).toHaveLength(1);
  });

  it("orders newest-first by lastUpdated and paginates with a stable keyset cursor", async () => {
    useFreshDb();
    const messages = Array.from({ length: 5 }, (_, index) =>
      mandateMessage(`mandate-${index}`, 1000 + index * 1000, {
        mandateId: `UMN-${index}`,
        mandateMerchant: `Merchant ${index}`,
      }),
    );
    seedAndProject(messages, new Date(10000));

    const firstPage = await queryMandates({ limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.items[0]!.lastUpdated).toBeGreaterThan(firstPage.items[1]!.lastUpdated);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await queryMandates({ limit: 2, cursor: firstPage.nextCursor! });
    expect(secondPage.items).toHaveLength(2);

    const thirdPage = await queryMandates({ limit: 2, cursor: secondPage.nextCursor! });
    expect(thirdPage.items).toHaveLength(1);
    expect(thirdPage.nextCursor).toBeNull();

    const seenIds = new Set(
      [...firstPage.items, ...secondPage.items, ...thirdPage.items].map((m) => m.mandateId),
    );
    expect(seenIds.size).toBe(5);
  });

  it("does not skip or duplicate mandates that share the exact same lastUpdated", async () => {
    useFreshDb();
    const messages = [
      mandateMessage("mandate-a", 5000, { mandateId: "UMN-A", mandateMerchant: "Netflix" }),
      mandateMessage("mandate-b", 5000, { mandateId: "UMN-B", mandateMerchant: "Spotify" }),
    ];
    seedAndProject(messages, new Date(10000));

    const firstPage = await queryMandates({ limit: 1 });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await queryMandates({ limit: 1, cursor: firstPage.nextCursor! });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]!.mandateId).not.toBe(firstPage.items[0]!.mandateId);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("rejects a limit outside the valid range instead of silently clamping", async () => {
    useFreshDb();
    seedAndProject([], new Date(2000));
    await expect(queryMandates({ limit: 0 })).rejects.toThrow(/limit/i);
    await expect(queryMandates({ limit: 101 })).rejects.toThrow(/limit/i);
    await expect(queryMandates({ limit: 1.5 })).rejects.toThrow(/limit/i);
  });
});

describe("queryMandateEvents", () => {
  it("is scoped to one mandate and orders newest-first", async () => {
    useFreshDb();
    const messages = [
      mandateMessage("mandate-1", 1000, { mandateEvent: "active" }),
      mandateMessage("mandate-2", 2000, { mandateEvent: "cancelled" }),
      mandateMessage("mandate-3", 3000, { mandateEvent: "active" }),
    ];
    seedAndProject(messages, new Date(4000));

    const page = await queryMandateEvents({ mandateId: "UMN123456789" });
    expect(page.items).toHaveLength(3);
    expect(page.items.map((e) => e.status)).toEqual(["active", "cancelled", "active"]);
    expect(page.items[0]!.date).toBeGreaterThan(page.items[1]!.date);
  });

  it("does not include another mandate's events", async () => {
    useFreshDb();
    const messages = [
      mandateMessage("mandate-1", 1000, { mandateId: "UMN-A", mandateMerchant: "Netflix" }),
      mandateMessage("mandate-2", 2000, { mandateId: "UMN-B", mandateMerchant: "Spotify" }),
    ];
    seedAndProject(messages, new Date(3000));

    const page = await queryMandateEvents({ mandateId: "UMN-A" });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.mandateId).toBe("UMN-A");
  });

  it("orders newest-first and paginates with a stable keyset cursor", async () => {
    useFreshDb();
    const messages = Array.from({ length: 5 }, (_, index) =>
      mandateMessage(`mandate-${index}`, 1000 + index * 1000, {
        mandateEvent: index % 2 === 0 ? "active" : "cancelled",
      }),
    );
    seedAndProject(messages, new Date(10000));

    const firstPage = await queryMandateEvents({ mandateId: "UMN123456789", limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.items[0]!.date).toBeGreaterThan(firstPage.items[1]!.date);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await queryMandateEvents({
      mandateId: "UMN123456789",
      limit: 2,
      cursor: firstPage.nextCursor!,
    });
    expect(secondPage.items).toHaveLength(2);

    const thirdPage = await queryMandateEvents({
      mandateId: "UMN123456789",
      limit: 2,
      cursor: secondPage.nextCursor!,
    });
    expect(thirdPage.items).toHaveLength(1);
    expect(thirdPage.nextCursor).toBeNull();

    const seenIds = new Set(
      [...firstPage.items, ...secondPage.items, ...thirdPage.items].map((e) => e.id),
    );
    expect(seenIds.size).toBe(5);
  });

  it("does not skip or duplicate events that share the exact same date", async () => {
    useFreshDb();
    const messages = [
      mandateMessage("mandate-a", 5000, { mandateEvent: "active" }),
      mandateMessage("mandate-b", 5000, { mandateEvent: "cancelled" }),
    ];
    seedAndProject(messages, new Date(10000));

    const firstPage = await queryMandateEvents({ mandateId: "UMN123456789", limit: 1 });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await queryMandateEvents({
      mandateId: "UMN123456789",
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
    await expect(queryMandateEvents({ mandateId: "does-not-matter", limit: 0 })).rejects.toThrow(
      /limit/i,
    );
    await expect(queryMandateEvents({ mandateId: "does-not-matter", limit: 101 })).rejects.toThrow(
      /limit/i,
    );
    await expect(queryMandateEvents({ mandateId: "does-not-matter", limit: 1.5 })).rejects.toThrow(
      /limit/i,
    );
  });

  it("returns an empty page, not an error, for a mandate with no events", async () => {
    useFreshDb();
    seedAndProject([], new Date(2000));
    const page = await queryMandateEvents({ mandateId: "nonexistent" });
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });
});

describe("queryMandateEventsForMandates", () => {
  it("groups each mandate's events, newest-first, with no cross-mandate leakage", async () => {
    useFreshDb();
    seedAndProject(
      [
        mandateMessage("a-1", 1000, { mandateId: "UMN-A", mandateMerchant: "Netflix", mandateEvent: "active" }),
        mandateMessage("a-2", 3000, { mandateId: "UMN-A", mandateMerchant: "Netflix", mandateEvent: "cancelled" }),
        mandateMessage("b-1", 2000, { mandateId: "UMN-B", mandateMerchant: "Spotify", mandateEvent: "active" }),
      ],
      new Date(5000),
    );

    const grouped = await queryMandateEventsForMandates(["UMN-A", "UMN-B"]);
    expect(grouped.get("UMN-A")!.map((event) => event.status)).toEqual(["cancelled", "active"]);
    expect(grouped.get("UMN-A")!.every((event) => event.mandateId === "UMN-A")).toBe(true);
    expect(grouped.get("UMN-B")!).toHaveLength(1);
    expect(grouped.get("UMN-B")![0]!.mandateId).toBe("UMN-B");
  });

  it("matches queryMandateEvents' first page for every mandate", async () => {
    useFreshDb();
    seedAndProject(
      Array.from({ length: 5 }, (_, index) =>
        mandateMessage(`m-${index}`, 1000 + index * 1000, {
          mandateEvent: index % 2 === 0 ? "active" : "cancelled",
        }),
      ),
      new Date(10000),
    );

    const grouped = await queryMandateEventsForMandates(["UMN123456789"], 3);
    const page = await queryMandateEvents({ mandateId: "UMN123456789", limit: 3 });
    expect(grouped.get("UMN123456789")).toEqual(page.items);
  });

  it("caps each mandate at the per-mandate limit", async () => {
    useFreshDb();
    seedAndProject(
      Array.from({ length: 4 }, (_, index) => mandateMessage(`m-${index}`, 1000 + index * 1000)),
      new Date(10000),
    );
    const grouped = await queryMandateEventsForMandates(["UMN123456789"], 2);
    expect(grouped.get("UMN123456789")).toHaveLength(2);
  });

  it("returns an empty list for unknown ids and an empty map for no ids", async () => {
    useFreshDb();
    seedAndProject([], new Date(2000));
    const grouped = await queryMandateEventsForMandates(["nonexistent", "nonexistent"]);
    expect([...grouped.entries()]).toEqual([["nonexistent", []]]);
    expect((await queryMandateEventsForMandates([])).size).toBe(0);
  });

  it("rejects a per-mandate limit outside the valid range", async () => {
    useFreshDb();
    seedAndProject([], new Date(2000));
    await expect(queryMandateEventsForMandates(["x"], 0)).rejects.toThrow(/limit/i);
    await expect(queryMandateEventsForMandates(["x"], 101)).rejects.toThrow(/limit/i);
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

  // With no cursor at all (the first page), there's no WHERE predicate —
  // SQLite's own EXPLAIN QUERY PLAN correctly reports "SCAN mandates USING
  // INDEX ..." ("SCAN" here means "walk in index order," not "scan the raw
  // table"). The real regression to guard against is walking the table's
  // own rowid order and needing a separate temp b-tree to sort it — i.e. a
  // scan with no "USING INDEX" naming this index at all.
  it("queryMandates's real generated query is served by mandates_last_updated_mandate_id_idx, not a raw table scan or a temp sort", async () => {
    useFreshDb();
    seedAndProject([], new Date(2000));

    const plan = await planForRealCall(() => queryMandates(), "mandates");

    expect(plan.some((line) => line.includes("mandates_last_updated_mandate_id_idx"))).toBe(true);
    expect(
      plan.some(
        (line) =>
          /SCAN mandates\b/i.test(line) && !line.includes("mandates_last_updated_mandate_id_idx"),
      ),
    ).toBe(false);
    expect(plan.some((line) => /USE TEMP B-TREE/i.test(line))).toBe(false);
  });

  it("queryMandateEvents's real generated query is served by mandate_events_mandate_id_date_id_idx", async () => {
    useFreshDb();
    seedAndProject([], new Date(2000));

    const plan = await planForRealCall(
      () => queryMandateEvents({ mandateId: "UMN123456789" }),
      "mandate_events",
    );

    expect(plan.some((line) => line.includes("mandate_events_mandate_id_date_id_idx"))).toBe(true);
    expect(
      plan.some(
        (line) =>
          /SCAN mandate_events\b/i.test(line) &&
          !line.includes("mandate_events_mandate_id_date_id_idx"),
      ),
    ).toBe(false);
    expect(plan.some((line) => /USE TEMP B-TREE/i.test(line))).toBe(false);
  });

  // Control check: a query with the same predicate but no ORDER BY at all
  // should still find the index for the WHERE clause — proving the
  // previous assertion is actually sensitive to the real index existing.
  it("control: a predicate-only query (no keyset order) still finds the composite index's leading columns", () => {
    useFreshDb();
    seedAndProject([], new Date(2000));

    const plan = rawSqlite
      .prepare(`EXPLAIN QUERY PLAN SELECT id FROM mandate_events WHERE mandate_id = ?`)
      .all("UMN123456789")
      .map((row) => (row as { detail: string }).detail);
    expect(plan.some((line) => line.includes("mandate_events_mandate_id_date_id_idx"))).toBe(true);
  });
});
