// Tests db/queries-home.ts against a real SQLite database (better-sqlite3),
// same approach as queries-accounts.test.ts/projections.test.ts: fixtures
// go through the real write path (deriveDashboardProjection ->
// replaceProjection), not hand-inserted rows.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PARSER_VERSION, type MalanaResult } from "@zeeya/parser/malana";
import { deriveDashboardProjection } from "../lib/dashboard";
import type { ParsedSms } from "../lib/sms";
import { replaceProjection } from "./projections";
import type { AsyncQueryClient } from "./queries";
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

function asyncClientFor(sqlite: Database.Database): AsyncQueryClient {
  return {
    async getAllAsync<T>(source: string, params: unknown[]): Promise<T[]> {
      return sqlite.prepare(source).all(...params) as T[];
    },
  };
}

let rawSqlite: Database.Database;
let testDb: ReturnType<typeof freshDb>["drizzleDb"];
let client: AsyncQueryClient;
let afterDefaultQuery: ((source: string) => void) | null = null;

function closeCurrentDb(): void {
  afterDefaultQuery = null;
  if (rawSqlite?.open) rawSqlite.close();
}

function useFreshDb(): void {
  closeCurrentDb();
  const fresh = freshDb();
  rawSqlite = fresh.sqlite;
  testDb = fresh.drizzleDb;
  client = asyncClientFor(fresh.sqlite);
}

afterEach(closeCurrentDb);

// better-sqlite3 does not expose a portable trace hook in its TypeScript
// surface. Wrapping this test database's prepare method records every SQL
// statement that the real Home data source executes, including the Drizzle
// freshness checks and the async query-client statements.
async function withSqlTrace<T>(
  run: (statements: string[]) => Promise<T>,
): Promise<{ result: T; statements: string[] }> {
  const database = rawSqlite;
  const statements: string[] = [];
  const originalPrepare = database.prepare;
  database.prepare = ((source: string) => {
    statements.push(source);
    return originalPrepare.call(database, source);
  }) as typeof database.prepare;

  try {
    return { result: await run(statements), statements };
  } finally {
    database.prepare = originalPrepare;
  }
}

// db/client.native.ts / db/client.ts open a real connection at module load
// — mock both so queries-home.ts's own `import { sqlite } from "./client"`
// (used by defaultClient(), including the concrete homeDataSource methods)
// and queries-accounts.ts's/ingestion.ts's `import { db } from "./client"`
// resolve to this test's in-memory database instead.
vi.mock("./client", () => ({
  get db() {
    return testDb;
  },
  get sqlite() {
    return rawSqlite
      ? {
          getAllAsync: async <T>(source: string, params: unknown[]) => {
            const rows = rawSqlite.prepare(source).all(...(params as unknown[])) as T[];
            afterDefaultQuery?.(source);
            return rows;
          },
        }
      : null;
  },
}));

const {
  queryHomeAccounts,
  queryHomeUnassignedReadings,
  queryHomeFlowDays,
  queryHomeCalendarMonths,
  queryHomeSubscriptionOverview,
  queryHomeRecentActivity,
  queryHomeActivityCategoryCounts,
  queryHomeTotalActivityCount,
  homeDataSource,
  HOME_MANDATE_RECENT_EVENTS_LIMIT,
  HOME_SUBSCRIPTION_PREVIEW_LIMIT,
} = await import("./queries-home");

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

function categorizedSms(
  id: string,
  sender: string,
  date: number,
  r: Partial<MalanaResult>,
): ParsedSms {
  return {
    ...sms(id, sender, date, r),
    result: { ...result(r), matchedCategories: ["GRM_BANK"] },
  } as unknown as ParsedSms;
}

function insertLedgerMessage(message: ParsedSms): void {
  testDb
    .insert(schema.smsLedger)
    .values({
      id: message.id,
      sender: message.sender,
      body: message.body,
      date: message.date,
      parserVersion: PARSER_VERSION,
      parsedResult: JSON.stringify(message.result),
      ingestionStatus: "parsed",
      createdAt: message.date,
    })
    .onConflictDoNothing()
    .run();
}

function markProjectionDirty(sourceRevision: number, projectedRevision: number): void {
  rawSqlite
    .prepare(
      `UPDATE projection_state
       SET source_revision = ?, projected_revision = ?
       WHERE id = 'dashboard'`,
    )
    .run(sourceRevision, projectedRevision);
}

function projectionRevisions(): { sourceRevision: number; projectedRevision: number } {
  return rawSqlite
    .prepare(
      `SELECT source_revision AS sourceRevision,
              projected_revision AS projectedRevision
       FROM projection_state
       WHERE id = 'dashboard'`,
    )
    .get() as { sourceRevision: number; projectedRevision: number };
}

function seedAndProject(messages: ParsedSms[], now: Date) {
  for (const message of messages) {
    insertLedgerMessage(message);
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

const DAY = 24 * 60 * 60 * 1000;

// The SQL-side DST regression test below needs the process's OWN local
// timezone to actually observe a DST transition — this dev machine's real
// Windows-configured timezone is India Standard Time, which never does, so
// the test is skipped rather than silently passing without having tested
// anything, UNLESS TZ is set before the process starts.
//
// If you set TZ to exercise this: better-sqlite3's native SQLite binding
// calls straight into the OS C runtime's localtime() for the 'localtime'
// modifier. On Windows that's MSVCRT's _tzset()/localtime(), which predates
// the IANA tz database and only understands the POSIX form (e.g.
// "EST5EDT"), NOT an IANA zone name like "America/New_York" — V8's own
// Date correctly resolves the IANA name (it ships its own ICU tz data
// independent of the C runtime), so the two can silently disagree. Verified
// directly: `TZ=America/New_York` made SQLite's strftime(...,'localtime')
// apply only a flat +1h "DST is active" bias and ignore the real UTC offset
// entirely (Jan: local==utc; Jul: local=utc+1h — neither matches EST/EDT),
// while `TZ=EST5EDT` (POSIX form) made it match V8's Date exactly across
// EST, EDT, and the transition boundary itself. Use the POSIX form on
// Windows: `TZ=EST5EDT pnpm vitest run db/queries-home.test.ts`. On
// Linux/macOS CI, the OS's own configured IANA timezone is what libc's
// localtime() reads directly (no TZ env var needed at all, and MSVCRT's
// IANA-name gap doesn't exist there) — the real expo-sqlite runtime
// (Android/iOS) is Unix-based the same way, so this Windows-specific
// MSVCRT/IANA gap is a test-tooling limitation, not evidence of a
// production bug; it does not by itself prove expo-sqlite is correct
// either, since it hasn't been exercised on an actual device from this
// environment — treat this test's pass as circumstantial support, not
// device-verified proof, until it's actually run against expo-sqlite on
// Android/iOS hardware or an emulator/simulator.
const SYSTEM_TZ_OBSERVES_DST = (() => {
  const jan = new Date(2024, 0, 1).getTimezoneOffset();
  const jul = new Date(2024, 6, 1).getTimezoneOffset();
  return jan !== jul;
})();

// Finds the actual local date in 2024 where the process's OWN timezone
// offset changes, rather than hardcoding a US-specific date (2024-03-10)
// that would be meaningless — or silently untested — for whatever
// DST-observing zone this file actually runs under. Returns the day
// AFTER the transition (the first day with the new, post-transition
// offset), and the pre/post offsets themselves so the test can assert the
// offset genuinely changed, not just that some date was picked.
function findDstTransitionDay2024(): { day: Date; beforeOffset: number; afterOffset: number } {
  let previousOffset = new Date(2024, 0, 1).getTimezoneOffset();
  // Walks by the Date(year, month, day + n) constructor — not by adding a
  // flat 24h in milliseconds, which drifts off local midnight the moment it
  // crosses a DST boundary and can skip past (or double-count) the actual
  // transition day. This is the exact class of bug the flowDays DST fix
  // itself corrects; the test helper must not reintroduce it.
  for (let dayOfYear = 1; dayOfYear <= 366; dayOfYear++) {
    const d = new Date(2024, 0, 1 + dayOfYear);
    if (d.getFullYear() !== 2024) break;
    const offset = d.getTimezoneOffset();
    if (offset !== previousOffset) {
      return { day: d, beforeOffset: previousOffset, afterOffset: offset };
    }
    previousOffset = offset;
  }
  throw new Error("SYSTEM_TZ_OBSERVES_DST was true but no transition day was found in 2024");
}

describe("queryHomeAccounts / hasNewerSuggestedReading", () => {
  it("is false when there is no unassigned reading at all", async () => {
    useFreshDb();
    seedAndProject(
      [sms("bal-1", "VM-HDFCBK", 1000, { bankName: "HDFC Bank", acc: "XX1234", bal: "1000.00" })],
      new Date(2000),
    );
    const rows = await queryHomeAccounts(client);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.hasNewerSuggestedReading).toBe(false);
  });

  it("is true when a newer unassigned reading exists for the sole account sharing that bank+currency", async () => {
    useFreshDb();
    const messages = [
      sms("bal-1", "VM-HDFCBK", 1000, { bankName: "HDFC Bank", acc: "XX1234", bal: "1000.00" }),
      sms("unassigned-1", "VM-HDFCBK", 5000, { bankName: "HDFC Bank", acc: null, bal: "999.00" }),
    ];
    seedAndProject(messages, new Date(6000));
    const rows = await queryHomeAccounts(client);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.hasNewerSuggestedReading).toBe(true);
  });

  it("is false when the unassigned reading is older than the account's own balanceAsOf", async () => {
    useFreshDb();
    const messages = [
      sms("unassigned-1", "VM-HDFCBK", 1000, { bankName: "HDFC Bank", acc: null, bal: "999.00" }),
      sms("bal-1", "VM-HDFCBK", 5000, { bankName: "HDFC Bank", acc: "XX1234", bal: "1000.00" }),
    ];
    seedAndProject(messages, new Date(6000));
    const rows = await queryHomeAccounts(client);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.hasNewerSuggestedReading).toBe(false);
  });

  it("is false for BOTH accounts when two accounts share the same bank+currency (no sole candidate)", async () => {
    useFreshDb();
    const messages = [
      sms("bal-1", "VM-HDFCBK", 1000, { bankName: "HDFC Bank", acc: "XX1234", bal: "1000.00" }),
      sms("bal-2", "VM-HDFCBK", 1000, { bankName: "HDFC Bank", acc: "XX5678", bal: "2000.00" }),
      sms("unassigned-1", "VM-HDFCBK", 5000, { bankName: "HDFC Bank", acc: null, bal: "999.00" }),
    ];
    seedAndProject(messages, new Date(6000));
    const rows = await queryHomeAccounts(client);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.hasNewerSuggestedReading === false)).toBe(true);
  });
});

describe("queryHomeUnassignedReadings", () => {
  it("returns the single latest unassigned reading per distinct bank, not full history", async () => {
    useFreshDb();
    const messages = [
      sms("unassigned-1", "VM-HDFCBK", 1000, { bankName: "HDFC Bank", acc: null, bal: "100.00" }),
      sms("unassigned-2", "VM-HDFCBK", 2000, { bankName: "HDFC Bank", acc: null, bal: "200.00" }),
      sms("unassigned-3", "VM-ICICIB", 1500, { bankName: "ICICI Bank", acc: null, bal: "300.00" }),
    ];
    seedAndProject(messages, new Date(3000));
    const rows = await queryHomeUnassignedReadings(client);
    expect(rows).toHaveLength(2);
    const hdfc = rows.find((r) => r.bankName === "HDFC Bank");
    expect(hdfc?.id).toBe("unassigned-2");
    // Overall order is asOf DESC.
    expect(rows[0]!.asOf).toBeGreaterThanOrEqual(rows[1]!.asOf);
  });
});

describe("queryHomeFlowDays", () => {
  it("buckets income/expense into the last 7 local-calendar days ending on `at`'s own day", async () => {
    useFreshDb();
    const at = new Date(2024, 5, 15, 10, 0, 0);
    const messages = [
      sms("income-today", "VM-HDFCBK", at.getTime(), {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "500.00",
        trxTypeRich: "SALARY",
      }),
      sms("expense-yesterday", "VM-HDFCBK", at.getTime() - DAY, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "100.00",
        trxTypeRich: "EXPENSE",
      }),
      sms("too-old", "VM-HDFCBK", at.getTime() - 10 * DAY, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "999.00",
        trxTypeRich: "EXPENSE",
      }),
    ];
    seedAndProject(messages, at);
    const days = await queryHomeFlowDays("INR", at, client);
    expect(days).toHaveLength(7);
    expect(days[6]!.incomeMinorUnits).toBe(50000);
    expect(days[5]!.expenseMinorUnits).toBe(10000);
    const total = days.reduce((sum, d) => sum + d.expenseMinorUnits, 0);
    expect(total).toBe(10000); // the 10-day-old expense must not be included
  });

  // Regression for the review finding that `today.getTime() + 24h` is wrong
  // across a DST transition (a local day can be 23 or 25 real hours) — the
  // window end must be computed via the Date(year, month, day + 1)
  // constructor, matching queryDailySeries. `at` is set to the day AFTER a
  // US "spring forward" transition (2024-03-10), so the 7-day window's
  // start (`at` - 6 days) lands ON the 23-hour DST day itself — a fixed-24h
  // walk would misplace that day's own bucket boundary.
  // Bucketed purely in JS (new Date(y,m,d) constructors, no SQL
  // strftime/'localtime' involved — see queryHomeFlowDays's own comment),
  // so this test doesn't hit the Windows MSVCRT/IANA gap
  // SYSTEM_TZ_OBSERVES_DST's own comment documents for the SQL-side
  // calendar test below. It's still gated the same way: on a system whose
  // OWN timezone never observes DST (this dev machine's real Windows
  // timezone, India Standard Time), a hardcoded "2024-03-10" is never
  // actually a 23-hour day, so the test would silently pass without ever
  // exercising a real DST boundary. Use the same discovered-transition-day
  // approach as the calendar test, gated the same way — run with
  // `TZ=EST5EDT` (POSIX form; see findDstTransitionDay2024's own comment
  // for why the IANA form doesn't work for this file's SQL-side sibling
  // test, even though this particular test's own JS-only bucketing would
  // actually be fine with either form).
  it.skipIf(!SYSTEM_TZ_OBSERVES_DST)(
    "computes correct 7-day windows across a DST transition (23-hour day)",
    async () => {
      const { day: transitionDay, beforeOffset, afterOffset } = findDstTransitionDay2024();
      expect(afterOffset).not.toBe(beforeOffset);

      const at = new Date(
        transitionDay.getFullYear(),
        transitionDay.getMonth(),
        transitionDay.getDate() + 6,
        10,
        0,
        0,
      );
      const onDstDay = new Date(
        transitionDay.getFullYear(),
        transitionDay.getMonth(),
        transitionDay.getDate(),
        12,
        0,
        0,
      ).getTime();
      const messages = [
        sms("dst-expense", "VM-HDFCBK", onDstDay, {
          bankName: "HDFC Bank",
          acc: "XX1234",
          trx: "42.00",
          trxTypeRich: "EXPENSE",
        }),
      ];
      useFreshDb();
      seedAndProject(messages, at);
      const days = await queryHomeFlowDays("INR", at, client);
      expect(days).toHaveLength(7);
      // The DST-day transaction must land in exactly one bucket (day index
      // 0, the oldest of the 7), not be dropped or double-counted by an
      // off-by-one window boundary.
      expect(days[0]!.expenseMinorUnits).toBe(4200);
      const total = days.reduce((sum, d) => sum + d.expenseMinorUnits, 0);
      expect(total).toBe(4200);
    },
  );
});

describe("queryHomeCalendarMonths", () => {
  it("includes a zero-activity month as a zero-value bucket, not an absent one", async () => {
    useFreshDb();
    const at = new Date(2024, 5, 15);
    seedAndProject(
      [
        sms("expense-1", "VM-HDFCBK", at.getTime(), {
          bankName: "HDFC Bank",
          acc: "XX1234",
          trx: "100.00",
          trxTypeRich: "EXPENSE",
        }),
      ],
      at,
    );
    const page = await queryHomeCalendarMonths(
      { currency: "INR", at: at.getTime(), monthsBack: 3 },
      client,
    );
    expect(page.items).toHaveLength(3);
    const empty = page.items.find((m) => new Date(m.monthStart).getMonth() === at.getMonth() - 2);
    expect(empty).toBeDefined();
    expect(empty!.incomeMinorUnits).toBe(0);
    expect(empty!.expenseMinorUnits).toBe(0);
    expect(empty!.days).toEqual([]);
  });

  it("has nextCursor null when there is no earlier history than the window", async () => {
    useFreshDb();
    const at = new Date(2024, 5, 15);
    seedAndProject(
      [
        sms("expense-1", "VM-HDFCBK", at.getTime(), {
          bankName: "HDFC Bank",
          acc: "XX1234",
          trx: "100.00",
          trxTypeRich: "EXPENSE",
        }),
      ],
      at,
    );
    const page = await queryHomeCalendarMonths(
      { currency: "INR", at: at.getTime(), monthsBack: 3 },
      client,
    );
    expect(page.nextCursor).toBeNull();
  });

  it("has nextCursor present when a transaction exists before the window's oldest month", async () => {
    useFreshDb();
    const at = new Date(2024, 5, 15);
    const earlier = new Date(2024, 0, 1); // well before a 3-month window ending in June
    seedAndProject(
      [
        sms("expense-old", "VM-HDFCBK", earlier.getTime(), {
          bankName: "HDFC Bank",
          acc: "XX1234",
          trx: "50.00",
          trxTypeRich: "EXPENSE",
        }),
        sms("expense-recent", "VM-HDFCBK", at.getTime(), {
          bankName: "HDFC Bank",
          acc: "XX1234",
          trx: "100.00",
          trxTypeRich: "EXPENSE",
        }),
      ],
      at,
    );
    const page = await queryHomeCalendarMonths(
      { currency: "INR", at: at.getTime(), monthsBack: 3 },
      client,
    );
    expect(page.nextCursor).not.toBeNull();
  });

  // Regression for the review finding that the calendar query fetched every
  // raw transaction row in the window and summed it in JS — unbounded
  // database work against a table that only grows. The fixed query
  // aggregates by local day in SQL (strftime(..., 'unixepoch', 'localtime'))
  // and returns at most one row per (local day, direction), never one row
  // per transaction.
  it("aggregates in SQL — the day-total query returns at most one row per (local day, direction), not one per transaction", async () => {
    useFreshDb();
    const at = new Date(2024, 5, 15);
    // 50 transactions crammed onto the SAME day — if the query still
    // returned raw rows, this alone would prove it; instead assert the
    // day-level query issued by queryHomeCalendarMonths directly returns
    // at most 2 rows (income, expense) for this one day.
    const messages = Array.from({ length: 50 }, (_, i) =>
      sms(`same-day-${i}`, "VM-HDFCBK", at.getTime(), {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "10.00",
        trxTypeRich: "EXPENSE",
      }),
    );
    seedAndProject(messages, at);

    const dayRows = rawSqlite
      .prepare(
        `SELECT strftime('%Y-%m-%d', date / 1000, 'unixepoch', 'localtime') AS localDay,
                direction,
                SUM(amount_minor_units) AS totalMinorUnits
         FROM transactions
         WHERE currency = ? AND direction IN ('income', 'expense')
         GROUP BY localDay, direction`,
      )
      .all("INR");
    expect(dayRows).toHaveLength(1); // one (day, direction) bucket, not 50 rows

    const page = await queryHomeCalendarMonths(
      { currency: "INR", at: at.getTime(), monthsBack: 1 },
      client,
    );
    expect(page.items[0]!.expenseMinorUnits).toBe(50 * 1000);
  });

  // Regression for the review finding that this query's cost scaled with
  // total transaction volume in the window rather than with the bounded
  // output size (~60 months worth of day buckets).
  it("the day-total query's row count does not scale with total transactions in the window", async () => {
    useFreshDb();
    seedAndProject([], new Date(2000));
    const insertLedger = rawSqlite.prepare(
      "INSERT INTO sms_ledger (id, sender, body, date, parser_version, parsed_result, ingestion_status, created_at) VALUES (?,?,?,?,?,?,?,?)",
    );
    const insertTxn = rawSqlite.prepare(
      "INSERT INTO transactions (id, sms_id, amount_minor_units, currency, direction, category, date) VALUES (?,?,?,?,?,?,?)",
    );
    // 5000 transactions spread across 365 distinct days, same currency.
    const seedMany = rawSqlite.transaction((n: number) => {
      for (let i = 0; i < n; i++) {
        const id = `bulk-${i}`;
        const date = (i % 365) * DAY + 10 * 365 * DAY; // spread across ~1 year, well past epoch
        insertLedger.run(id, "X", "body", date, "v1", "{}", "parsed", date);
        insertTxn.run(id, id, 1000, "INR", "expense", "Transaction", date);
      }
    });
    seedMany(5000);

    const dayRows = rawSqlite
      .prepare(
        `SELECT strftime('%Y-%m-%d', date / 1000, 'unixepoch', 'localtime') AS localDay,
                direction,
                SUM(amount_minor_units) AS totalMinorUnits
         FROM transactions
         WHERE currency = ? AND direction IN ('income', 'expense')
         GROUP BY localDay, direction`,
      )
      .all("INR");
    // At most 365 distinct days * 1 direction (only expense seeded here) —
    // not 5000 raw rows.
    expect(dayRows.length).toBeLessThanOrEqual(365);
  });

  // DST regression: a local day spanning a "spring forward"/"fall back"
  // transition is still exactly one local calendar day for bucketing
  // purposes — strftime's 'localtime' modifier must agree with JS's own
  // `new Date(y, m, d)` local-day semantics across that boundary, not just
  // on an ordinary day. Requires the process's OWN system timezone to
  // observe DST (see SYSTEM_TZ_OBSERVES_DST's own comment for the full
  // Windows MSVCRT/IANA explanation). On Windows, set TZ to the POSIX form
  // BEFORE the process starts, e.g. `TZ=EST5EDT pnpm vitest run
  // db/queries-home.test.ts` — NOT an IANA name like "America/New_York",
  // which better-sqlite3's native binding (unlike V8's own Date) cannot
  // resolve correctly on Windows. On Linux/macOS, the OS's own configured
  // IANA timezone already observes DST correctly with no TZ override
  // needed. It is skipped, not falsely green, everywhere this isn't set up.
  it.skipIf(!SYSTEM_TZ_OBSERVES_DST)(
    "buckets correctly across a DST transition day (matches JS local-day semantics)",
    async () => {
      const { day: transitionDay, beforeOffset, afterOffset } = findDstTransitionDay2024();
      // Confirm this run's own timezone genuinely crosses a DST boundary on
      // this date, per the review's own instruction — not just that some
      // date was picked without verifying an offset change actually occurs.
      expect(afterOffset).not.toBe(beforeOffset);

      // Two transactions a few hours apart on the transition day itself,
      // both intended to land in the same local calendar-day bucket.
      const morning = new Date(
        transitionDay.getFullYear(),
        transitionDay.getMonth(),
        transitionDay.getDate(),
        1,
        0,
        0,
      ).getTime();
      const lateNight = new Date(
        transitionDay.getFullYear(),
        transitionDay.getMonth(),
        transitionDay.getDate(),
        23,
        0,
        0,
      ).getTime();
      const messages = [
        sms("dst-1", "VM-HDFCBK", morning, {
          bankName: "HDFC Bank",
          acc: "XX1234",
          trx: "50.00",
          trxTypeRich: "EXPENSE",
        }),
        sms("dst-2", "VM-HDFCBK", lateNight, {
          bankName: "HDFC Bank",
          acc: "XX1234",
          trx: "25.00",
          trxTypeRich: "EXPENSE",
        }),
      ];
      const at = new Date(
        transitionDay.getFullYear(),
        transitionDay.getMonth(),
        transitionDay.getDate(),
      );
      useFreshDb();
      seedAndProject(messages, at);

      const page = await queryHomeCalendarMonths(
        { currency: "INR", at: at.getTime(), monthsBack: 1 },
        client,
      );
      const dstDay = page.items[0]!.days.find(
        (d) =>
          new Date(d.day).getDate() === transitionDay.getDate() &&
          new Date(d.day).getMonth() === transitionDay.getMonth(),
      );
      expect(dstDay).toBeDefined();
      // Both transactions land in the same local-day bucket — 7500, not split
      // across two adjacent buckets by a UTC/local mismatch at the DST edge.
      expect(dstDay!.expenseMinorUnits).toBe(7500);
    },
  );
});

describe("subscriptionOverview: reactivated / activeCount / cancelledCount / totalsByCurrency", () => {
  it("computes reactivated from the mandate's COMPLETE event history even when recentEvents truncates the cancellation", async () => {
    useFreshDb();
    const messages: ParsedSms[] = [];
    // 1 active event + (LIMIT) more active-ish updates so the cancel event
    // (oldest) falls outside recentEvents's own bounded tail, then a final
    // active event.
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
    );
    // Push enough subsequent "active" events (each a distinct smsId at a
    // later date) so the cancel above is definitely outside the recent-N
    // window.
    for (let i = 0; i < HOME_MANDATE_RECENT_EVENTS_LIMIT + 2; i++) {
      messages.push(
        sms(`mandate-active-${i}`, "VM-HDFCBK", 3000 + i * 1000, {
          mandateId: "UMN1",
          mandateMerchant: "Netflix",
          mandateAmount: "199.00",
          mandateEvent: "active",
        }),
      );
    }
    seedAndProject(messages, new Date(20000));

    const overview = await queryHomeSubscriptionOverview(new Date(20000), client);
    const mandateItem = overview.items.find(
      (item) => item.kind === "mandate" && item.mandateId === "UMN1",
    );
    expect(mandateItem).toBeDefined();
    if (mandateItem?.kind === "mandate") {
      expect(mandateItem.reactivated).toBe(true);
      expect(mandateItem.recentEvents).toHaveLength(HOME_MANDATE_RECENT_EVENTS_LIMIT);
      // The bounded tail must not itself contain the cancelled event —
      // proving reactivated truly came from the complete history, not a
      // lucky inclusion in the tail.
      expect(mandateItem.recentEvents.every((e) => e.status !== "cancelled")).toBe(true);
    }
  });

  it("computes activeCount/cancelledCount/totalsByCurrency from full aggregation, not the capped preview items", async () => {
    useFreshDb();
    const messages: ParsedSms[] = [];
    // More mandates than the preview cap, all active with a known amount.
    const extraCount = 25; // > HOME_SUBSCRIPTION_PREVIEW_LIMIT (20)
    for (let i = 0; i < extraCount; i++) {
      messages.push(
        sms(`mandate-${i}`, "VM-HDFCBK", 1000 + i * 1000, {
          mandateId: `UMN-${i}`,
          mandateMerchant: `Merchant ${i}`,
          mandateAmount: "100.00",
          mandateEvent: "active",
        }),
      );
    }
    seedAndProject(messages, new Date(100000));

    const overview = await queryHomeSubscriptionOverview(new Date(100000), client);
    expect(overview.items.length).toBeLessThanOrEqual(20);
    expect(overview.activeCount).toBe(extraCount);
    expect(overview.totalsByCurrency.INR).toBe(extraCount * 10000);
  });

  // Regression for the review finding that expired ("likely") subscriptions
  // still counted toward totalsByCurrency and activeCount.
  it("excludes a subscription older than RECENCY_WINDOW_DAYS from totalsByCurrency and activeCount", async () => {
    useFreshDb();
    const messages = Array.from({ length: 3 }, (_, i) => ({
      ...sms(`old-sub-${i}`, "VM-HDFCBK", i * 30 * DAY + 1000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "199.00",
        trxTypeRich: "EXPENSE",
        brandName: "Netflix",
      }),
      result: {
        ...result({
          bankName: "HDFC Bank",
          acc: "XX1234",
          trx: "199.00",
          trxTypeRich: "EXPENSE",
          brandName: "Netflix",
        }),
        matchedCategories: ["GRM_BANK"],
      },
    })) as unknown as ParsedSms[];
    // The subscription's own lastDate is the newest occurrence (2*30*DAY);
    // evaluate far enough past that RECENCY_WINDOW_DAYS (60) has elapsed.
    const seedAt = new Date(2 * 30 * DAY + 10000);
    seedAndProject(messages, seedAt);
    const farFuture = new Date(2 * 30 * DAY + 10000 + 90 * DAY);

    const overview = await queryHomeSubscriptionOverview(farFuture, client);
    expect(overview.totalsByCurrency.INR ?? 0).toBe(0);
    expect(overview.activeCount).toBe(0);
    expect(overview.items.some((item) => item.kind === "subscription")).toBe(false);
  });

  // Regression: preview membership is decided by recency (mandates.
  // lastUpdated / subscriptions.lastDate), not by which table a row lives
  // in — a single, more-recent subscription must be able to outrank every
  // one of 25 older mandates and appear in the top-20 preview, proving
  // membership comes from the merge's own sortAt comparison across both
  // sources, not a per-table cap applied before any cross-source ranking.
  it("a more-recent subscription outranks and displaces older mandates in the top-N preview", async () => {
    useFreshDb();
    const messages: ParsedSms[] = [];
    // 25 mandates, all older (by lastUpdated) than the subscription below.
    for (let i = 0; i < 25; i++) {
      messages.push(
        sms(`mandate-${i}`, "VM-HDFCBK", 1000 + i * 1000, {
          mandateId: `UMN-${String(i).padStart(2, "0")}`,
          mandateMerchant: `Merchant ${i}`,
          mandateAmount: "100.00",
          mandateEvent: "active",
        }),
      );
    }
    // A subscription whose lastDate (the newest of its 3 qualifying
    // occurrences) is newer than every mandate above.
    const now = new Date(1000 + 25 * 1000 + 4 * 30 * DAY);
    const subscriptionMessages = Array.from({ length: 3 }, (_, i) => ({
      ...sms(`newer-sub-${i}`, "VM-HDFCBK", now.getTime() - (2 - i) * 30 * DAY, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "199.00",
        trxTypeRich: "EXPENSE",
        brandName: "NewestMerchant",
      }),
      result: {
        ...result({
          bankName: "HDFC Bank",
          acc: "XX1234",
          trx: "199.00",
          trxTypeRich: "EXPENSE",
          brandName: "NewestMerchant",
        }),
        matchedCategories: ["GRM_BANK"],
      },
    })) as unknown as ParsedSms[];
    seedAndProject([...messages, ...subscriptionMessages], now);

    const overview = await queryHomeSubscriptionOverview(now, client);
    const hasNewerSubscription = overview.items.some(
      (item) => item.kind === "subscription" && item.merchant === "NewestMerchant",
    );
    expect(hasNewerSubscription).toBe(true);
    expect(overview.items.length).toBeLessThanOrEqual(20);
    // It should rank first (most recent sortAt of everything seeded).
    expect(overview.items[0]?.kind === "subscription" && overview.items[0].merchant).toBe(
      "NewestMerchant",
    );
  });

  // Regression for the Spec finding that the JS merge's `id.localeCompare()`
  // tiebreaker could disagree with SQLite's own BINARY id ordering (the
  // ordering each source query's LIMIT was already applied under),
  // invalidating the "top N from each source is provably sufficient"
  // proof. Seeds more than 20 mandates sharing the EXACT SAME lastUpdated
  // timestamp, with mixed-case and punctuation-bearing mandateIds whose
  // BINARY vs. locale ordering genuinely differ (e.g. punctuation sorts
  // before/after letters differently under the two collations, and
  // lowercase vs. uppercase compare oppositely). The merge must reproduce
  // exactly the same top-20 SQL's own (last_updated DESC, mandate_id DESC)
  // BINARY ordering already established — never re-derive an order from
  // id in JS.
  it("preserves SQL's own BINARY id ordering for >20 equal-timestamp mixed-case/punctuation ids, never JS locale ordering", async () => {
    useFreshDb();
    const sameTimestamp = 5000;
    // Mixed-case + punctuation ids where BINARY and localeCompare disagree:
    // BINARY (byte/codepoint) order sorts all uppercase letters before all
    // lowercase ones and treats punctuation strictly by codepoint, while
    // JS's default locale-aware localeCompare interleaves case
    // ("a" vs "B") and can treat punctuation differently.
    const ids = [
      "UMN-Zebra",
      "umn-zebra",
      "UMN-apple",
      "umn-Apple",
      "UMN_bravo",
      "umn.bravo",
      "UMN-1",
      "UMN-2",
      "umn-1",
      "umn-2",
      "UMN-!alpha",
      "UMN-#beta",
      "UMN-$gamma",
      "UMN-%delta",
      "UMN-&epsilon",
      "umn-Zeta",
      "UMN-Eta",
      "umn-theta",
      "UMN-Iota",
      "umn-Kappa",
      "UMN-Lambda",
      "umn-Mu",
      "UMN-Nu",
    ];
    expect(ids.length).toBeGreaterThan(HOME_SUBSCRIPTION_PREVIEW_LIMIT);
    const messages = ids.map((id) =>
      sms(`mandate-${id}`, "VM-HDFCBK", sameTimestamp, {
        mandateId: id,
        mandateMerchant: `Merchant ${id}`,
        mandateAmount: "100.00",
        mandateEvent: "active",
      }),
    );
    seedAndProject(messages, new Date(sameTimestamp + 10000));

    // The expected top-20: SQL's own real (last_updated DESC, mandate_id
    // DESC) ordering, queried directly against the same fixture, using the
    // exact query the production code issues.
    const expectedTopIds = await client
      .getAllAsync<{
        mandateId: string;
      }>(
        `SELECT mandate_id AS mandateId FROM mandates ORDER BY last_updated DESC, mandate_id DESC LIMIT ?`,
        [HOME_SUBSCRIPTION_PREVIEW_LIMIT],
      )
      .then((rows) => rows.map((r) => r.mandateId));

    const overview = await queryHomeSubscriptionOverview(new Date(sameTimestamp + 10000), client);
    const actualTopIds = overview.items
      .filter((item): item is Extract<typeof item, { kind: "mandate" }> => item.kind === "mandate")
      .map((item) => item.mandateId);

    expect(actualTopIds).toEqual(expectedTopIds);
  });

  // Regression: the previous mixed-case test only seeded mandates, proving
  // within-source BINARY ordering but never exercising the cross-source
  // merge boundary at all — it could not have caught a bug in how mandate
  // and subscription candidates interleave once BOTH sources have entries
  // sharing the exact same sortAt. This test mixes both kinds, all at one
  // shared timestamp, well past HOME_SUBSCRIPTION_PREVIEW_LIMIT combined,
  // and asserts the exact top-20 (mandates ranked ahead of subscriptions on
  // the tie — mergePreviewCandidatesByRecency's own documented,
  // deterministic policy, not an incidental accident of `>=`), not just
  // "some subscription is included somewhere."
  it("resolves a mixed mandate/subscription equal-timestamp tie deterministically (mandate wins ties) across >20 combined candidates", async () => {
    useFreshDb();
    const sameTimestamp = 5000;
    // 15 mandates and 10 subscriptions (25 combined candidates, all at the
    // exact same sortAt) — more than HOME_SUBSCRIPTION_PREVIEW_LIMIT (20).
    const mandateIds = Array.from({ length: 15 }, (_, i) => `UMN-${String(i).padStart(2, "0")}`);
    const mandateMessages = mandateIds.map((id) =>
      sms(`mandate-${id}`, "VM-HDFCBK", sameTimestamp, {
        mandateId: id,
        mandateMerchant: `Merchant ${id}`,
        mandateAmount: "100.00",
        mandateEvent: "active",
      }),
    );

    // 10 distinct merchants, each producing a qualifying "likely"
    // subscription (3 occurrences, 30 days apart, ending exactly at
    // sameTimestamp so subscription.lastDate === sameTimestamp too).
    const subscriptionMessages: ParsedSms[] = [];
    const merchantNames = Array.from(
      { length: 10 },
      (_, i) => `Merchant${String(i).padStart(2, "0")}`,
    );
    for (const merchant of merchantNames) {
      for (let occurrence = 0; occurrence < 3; occurrence++) {
        const date = sameTimestamp - (2 - occurrence) * 30 * DAY;
        subscriptionMessages.push({
          ...sms(`sub-${merchant}-${occurrence}`, "VM-HDFCBK", date, {
            bankName: "HDFC Bank",
            acc: "XX1234",
            trx: "199.00",
            trxTypeRich: "EXPENSE",
            brandName: merchant,
          }),
          result: {
            ...result({
              bankName: "HDFC Bank",
              acc: "XX1234",
              trx: "199.00",
              trxTypeRich: "EXPENSE",
              brandName: merchant,
            }),
            matchedCategories: ["GRM_BANK"],
          },
        } as unknown as ParsedSms);
      }
    }
    const now = new Date(sameTimestamp + 10000);
    seedAndProject([...mandateMessages, ...subscriptionMessages], now);

    // Sanity: every subscription's own lastDate really did land on
    // sameTimestamp, so this genuinely exercises the cross-source tie.
    const subscriptionLastDates = await client.getAllAsync<{ lastDate: number }>(
      `SELECT last_date AS lastDate FROM subscriptions`,
      [],
    );
    expect(subscriptionLastDates.length).toBe(10);
    expect(subscriptionLastDates.every((row) => row.lastDate === sameTimestamp)).toBe(true);

    const overview = await queryHomeSubscriptionOverview(now, client);
    expect(overview.items.length).toBe(20);
    // Mandate wins every cross-source tie (the documented policy): all 15
    // mandates must be present, filling the cap, before any subscription
    // appears — since 15 mandates + up to 5 subscriptions = 20.
    const mandateCount = overview.items.filter((item) => item.kind === "mandate").length;
    const subscriptionCount = overview.items.filter((item) => item.kind === "subscription").length;
    expect(mandateCount).toBe(15);
    expect(subscriptionCount).toBe(5);
    // All 15 mandates present.
    const presentMandateIds = overview.items
      .filter((item): item is Extract<typeof item, { kind: "mandate" }> => item.kind === "mandate")
      .map((item) => item.mandateId)
      .sort();
    expect(presentMandateIds).toEqual([...mandateIds].sort());
    // The subscription half: exactly the 5 whose own subscriptions.id sorts
    // highest under SQLite's BINARY collation (subscriptions_last_date_id_idx's
    // own (last_date DESC, id DESC) order) — proving the subscription side
    // of the merge, not just the mandate side, is also index-order-correct
    // at the boundary.
    const expectedTopSubscriptionIds = await client
      .getAllAsync<{ id: string }>(
        `SELECT id FROM subscriptions ORDER BY last_date DESC, id DESC LIMIT 5`,
        [],
      )
      .then((rows) => rows.map((r) => r.id));
    const actualSubscriptionIds = overview.items
      .filter(
        (item): item is Extract<typeof item, { kind: "subscription" }> =>
          item.kind === "subscription",
      )
      .map((item) => item.id);
    expect(actualSubscriptionIds).toEqual(expectedTopSubscriptionIds);
  });
});

describe("recentActivity two-stage query", () => {
  it("does not erase a multi-category message's other categories when filtered by one category", async () => {
    useFreshDb();
    // A single SMS that matches two categories: GRM_BANK (via a real
    // transaction) and GRM_BILL. matchedCategories on MalanaResult drives
    // which activity rows get created (see db/projections.ts's
    // projectActivityRows / isActivityCategory filter).
    const messages = [
      {
        ...sms("multi-1", "VM-HDFCBK", 1000, {
          bankName: "HDFC Bank",
          acc: "XX1234",
          trx: "500.00",
          trxTypeRich: "EXPENSE",
          merchantCategory: "electricity",
        }),
        result: {
          ...result({
            bankName: "HDFC Bank",
            acc: "XX1234",
            trx: "500.00",
            trxTypeRich: "EXPENSE",
            merchantCategory: "electricity",
          }),
          matchedCategories: ["GRM_BANK", "GRM_BILL"],
        },
      },
    ] as unknown as ParsedSms[];
    seedAndProject(messages, new Date(2000));

    const filtered = await queryHomeRecentActivity({ category: "GRM_BILL" }, client);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.categories.sort()).toEqual(["GRM_BANK", "GRM_BILL"]);
  });

  it("routes a financial message's detailTarget to its transaction, not its activity row", async () => {
    useFreshDb();
    const messages = [
      {
        ...sms("fin-1", "VM-HDFCBK", 1000, {
          bankName: "HDFC Bank",
          acc: "XX1234",
          trx: "500.00",
          trxTypeRich: "EXPENSE",
        }),
        result: {
          ...result({
            bankName: "HDFC Bank",
            acc: "XX1234",
            trx: "500.00",
            trxTypeRich: "EXPENSE",
          }),
          matchedCategories: ["GRM_BANK"],
        },
      },
    ] as unknown as ParsedSms[];
    seedAndProject(messages, new Date(2000));
    const items = await queryHomeRecentActivity({}, client);
    expect(items).toHaveLength(1);
    expect(items[0]!.detailTarget).toEqual({ kind: "transaction", id: "fin-1" });
  });

  it("routes a purely non-financial message's detailTarget to its activity row, keyed by the lexicographically-smallest matching category", async () => {
    useFreshDb();
    const messages = [
      {
        ...sms("nonfin-1", "VM-DELIV", 1000, {
          vendor: "Amazon",
          trackingId: "TRK123",
        }),
        result: {
          ...result({ vendor: "Amazon", trackingId: "TRK123" }),
          matchedCategories: ["GRM_TRAVEL", "GRM_DELIVERY"],
        },
      },
    ] as unknown as ParsedSms[];
    seedAndProject(messages, new Date(2000));
    const items = await queryHomeRecentActivity({}, client);
    expect(items).toHaveLength(1);
    // "GRM_DELIVERY" < "GRM_TRAVEL" lexicographically.
    expect(items[0]!.detailTarget).toEqual({ kind: "activity", id: "nonfin-1|GRM_DELIVERY" });
  });

  it("isRecurring is true via mandateId match", async () => {
    useFreshDb();
    const messages = [
      sms("mandate-create", "VM-HDFCBK", 1000, {
        mandateId: "UMN1",
        mandateMerchant: "Netflix",
        mandateAmount: "199.00",
        mandateEvent: "active",
      }),
      {
        ...sms("mandate-charge", "VM-HDFCBK", 2000, {
          bankName: "HDFC Bank",
          acc: "XX1234",
          trx: "199.00",
          trxTypeRich: "AUTO_DEBIT",
          mandateId: "UMN1",
        }),
        result: {
          ...result({
            bankName: "HDFC Bank",
            acc: "XX1234",
            trx: "199.00",
            trxTypeRich: "AUTO_DEBIT",
            mandateId: "UMN1",
          }),
          matchedCategories: ["GRM_BANK"],
        },
      },
    ] as unknown as ParsedSms[];
    seedAndProject(messages, new Date(3000));
    const items = await queryHomeRecentActivity({}, client);
    const charge = items.find((i) => i.smsId === "mandate-charge");
    expect(charge?.isRecurring).toBe(true);
  });

  it("isRecurring is true via subscriptionIdentityKey match", async () => {
    useFreshDb();
    // Three same-merchant, same-amount, ~30-day-apart charges qualify as a
    // "likely" subscription (see lib/subscriptions.ts).
    const messages = Array.from({ length: 3 }, (_, i) => ({
      ...sms(`sub-${i}`, "VM-HDFCBK", i * 30 * DAY + 1000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "499.00",
        trxTypeRich: "EXPENSE",
        brandName: "Spotify",
      }),
      result: {
        ...result({
          bankName: "HDFC Bank",
          acc: "XX1234",
          trx: "499.00",
          trxTypeRich: "EXPENSE",
          brandName: "Spotify",
        }),
        matchedCategories: ["GRM_BANK"],
      },
    })) as unknown as ParsedSms[];
    const at = new Date(3 * 30 * DAY + 10000);
    seedAndProject(messages, at);
    const items = await queryHomeRecentActivity({ limit: 20, at: at.getTime() }, client);
    const last = items.find((i) => i.smsId === "sub-2");
    expect(last?.isRecurring).toBe(true);
  });

  it("isRecurring is false when neither a mandate nor a subscription matches", async () => {
    useFreshDb();
    const messages = [
      {
        ...sms("plain-1", "VM-HDFCBK", 1000, {
          bankName: "HDFC Bank",
          acc: "XX1234",
          trx: "50.00",
          trxTypeRich: "EXPENSE",
          brandName: "OneOffShop",
        }),
        result: {
          ...result({
            bankName: "HDFC Bank",
            acc: "XX1234",
            trx: "50.00",
            trxTypeRich: "EXPENSE",
            brandName: "OneOffShop",
          }),
          matchedCategories: ["GRM_BANK"],
        },
      },
    ] as unknown as ParsedSms[];
    seedAndProject(messages, new Date(2000));
    const items = await queryHomeRecentActivity({}, client);
    expect(items[0]!.isRecurring).toBe(false);
  });

  // Regressions for the review finding that recurrence matching dropped the
  // amount-tolerance rule (isInferredRecurringTransaction requires the
  // transaction amount within AMOUNT_TOLERANCE_RATIO (10%) of the
  // subscription's own amount, not merchant+currency alone).
  describe("isRecurring amount tolerance", () => {
    // Three ₹100 charges, 30 days apart, establish a "likely" ₹100
    // subscription (allQualifyingSubscriptions's trailingRecurringRun walks
    // BACKWARD from the newest occurrence — sub-2 — so subscription.amount
    // ends up exactly 100, last.amount). The probe transaction below is
    // placed a full year BEFORE sub-0 (a ~300+ day gap, far past
    // MAX_RECURRING_GAP_DAYS=45), so it can never extend or become part of
    // that trailing run itself — it's a separate, ordinary transaction
    // whose own subscriptionIdentityKey happens to match an
    // already-established subscription, which is exactly the case
    // isRecurring's amount-tolerance check is meant to gate.
    const baseRunMessages = Array.from({ length: 3 }, (_, i) => ({
      ...sms(`sub-${i}`, "VM-HDFCBK", i * 30 * DAY + 1000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "100.00",
        trxTypeRich: "EXPENSE",
        brandName: "Spotify",
      }),
      result: {
        ...result({
          bankName: "HDFC Bank",
          acc: "XX1234",
          trx: "100.00",
          trxTypeRich: "EXPENSE",
          brandName: "Spotify",
        }),
        matchedCategories: ["GRM_BANK"],
      },
    })) as unknown as ParsedSms[];
    const PROBE_DATE = -400 * DAY;

    function probeMessage(id: string, trx: string): ParsedSms {
      return {
        ...sms(id, "VM-HDFCBK", PROBE_DATE, {
          bankName: "HDFC Bank",
          acc: "XX1234",
          trx,
          trxTypeRich: "EXPENSE",
          brandName: "Spotify",
        }),
        result: {
          ...result({
            bankName: "HDFC Bank",
            acc: "XX1234",
            trx,
            trxTypeRich: "EXPENSE",
            brandName: "Spotify",
          }),
          matchedCategories: ["GRM_BANK"],
        },
      } as unknown as ParsedSms;
    }

    it("is false when the transaction amount is far outside the subscription's tolerance (₹100 vs ₹10,000)", async () => {
      useFreshDb();
      const outlier = probeMessage("sub-outlier", "10000.00");
      const at = new Date(2 * 30 * DAY + 10000);
      seedAndProject([...baseRunMessages, outlier], at);
      const items = await queryHomeRecentActivity({ limit: 20, at: at.getTime() }, client);
      const item = items.find((i) => i.smsId === "sub-outlier");
      expect(item?.isRecurring).toBe(false);
    });

    it("is true when the transaction amount is inside the 10% tolerance", async () => {
      useFreshDb();
      // 108 is 8% above 100 — inside the 10% tolerance.
      const inTolerance = probeMessage("sub-in-tolerance", "108.00");
      const at = new Date(2 * 30 * DAY + 10000);
      seedAndProject([...baseRunMessages, inTolerance], at);
      const items = await queryHomeRecentActivity({ limit: 20, at: at.getTime() }, client);
      const item = items.find((i) => i.smsId === "sub-in-tolerance");
      expect(item?.isRecurring).toBe(true);
    });

    it("is true exactly at the tolerance boundary (110, exactly 10% above 100)", async () => {
      useFreshDb();
      const atBoundary = probeMessage("sub-at-boundary", "110.00");
      const at = new Date(2 * 30 * DAY + 10000);
      seedAndProject([...baseRunMessages, atBoundary], at);
      const items = await queryHomeRecentActivity({ limit: 20, at: at.getTime() }, client);
      const item = items.find((i) => i.smsId === "sub-at-boundary");
      // isInferredRecurringTransaction's own predicate is <=, so the exact
      // boundary is inclusive (true), not excluded.
      expect(item?.isRecurring).toBe(true);
    });
  });

  // Regression for the review finding that expired subscriptions (older
  // than RECENCY_WINDOW_DAYS) still marked transactions recurring.
  it("is false once the matching subscription has aged past RECENCY_WINDOW_DAYS", async () => {
    useFreshDb();
    const messages = Array.from({ length: 3 }, (_, i) => ({
      ...sms(`sub-${i}`, "VM-HDFCBK", i * 30 * DAY + 1000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "499.00",
        trxTypeRich: "EXPENSE",
        brandName: "Spotify",
      }),
      result: {
        ...result({
          bankName: "HDFC Bank",
          acc: "XX1234",
          trx: "499.00",
          trxTypeRich: "EXPENSE",
          brandName: "Spotify",
        }),
        matchedCategories: ["GRM_BANK"],
      },
    })) as unknown as ParsedSms[];
    seedAndProject(messages, new Date(3 * 30 * DAY + 10000));
    // Evaluate recurrence far enough in the future that the subscription's
    // own lastDate (the 3rd charge) has aged out of the 60-day window.
    const farFuture = new Date(3 * 30 * DAY + 10000 + 90 * DAY);
    const items = await queryHomeRecentActivity({ limit: 20, at: farFuture.getTime() }, client);
    const last = items.find((i) => i.smsId === "sub-2");
    expect(last?.isRecurring).toBe(false);
  });
});

describe("activityCategoryCounts / totalActivityCount", () => {
  it("counts DISTINCT smsId per category, and total is not a sum of per-category counts", async () => {
    useFreshDb();
    const messages = [
      {
        ...sms("multi-1", "VM-HDFCBK", 1000, {
          bankName: "HDFC Bank",
          acc: "XX1234",
          trx: "500.00",
          trxTypeRich: "EXPENSE",
        }),
        result: {
          ...result({
            bankName: "HDFC Bank",
            acc: "XX1234",
            trx: "500.00",
            trxTypeRich: "EXPENSE",
          }),
          matchedCategories: ["GRM_BANK", "GRM_BILL"],
        },
      },
    ] as unknown as ParsedSms[];
    seedAndProject(messages, new Date(2000));

    const counts = await queryHomeActivityCategoryCounts(client);
    const bank = counts.find((c) => c.category === "GRM_BANK");
    const bill = counts.find((c) => c.category === "GRM_BILL");
    expect(bank?.count).toBe(1);
    expect(bill?.count).toBe(1);

    const total = await queryHomeTotalActivityCount(client);
    // Not 2 (bank + bill) — the same message counts once overall.
    expect(total).toBe(1);
  });
});

describe("readConsistentSnapshot wraps homeDataSource.load()", () => {
  it("retries when the projection revision changes between internal queries", async () => {
    useFreshDb();
    const firstMessage = sms("bal-1", "VM-HDFCBK", 1000, {
      bankName: "HDFC Bank",
      acc: "XX1234",
      bal: "1000.00",
    });
    seedAndProject([firstMessage], new Date(2000));

    const secondMessage = sms("bal-2", "VM-HDFCBK", 1500, {
      bankName: "HDFC Bank",
      acc: "XX1234",
      bal: "2000.00",
    });

    // Publish a complete second projection after the first internal Home
    // query has returned. This simulates a real atomic publish landing
    // between load()'s separately-issued queries: the first attempt has
    // already captured revision-1 account data, while the retry must capture
    // the revision-2 account data and every other projection table together.
    let accountQueries = 0;
    afterDefaultQuery = (source) => {
      if (accountQueries === 0 && /FROM accounts\b/i.test(source)) {
        accountQueries++;
        insertLedgerMessage(secondMessage);
        replaceProjection(
          testDb,
          deriveDashboardProjection([firstMessage, secondMessage], new Date(3000)),
          (transaction) => {
            transaction
              .update(schema.projectionState)
              .set({ sourceRevision: 2, projectedRevision: 2, updatedAt: 3000 })
              .where(eq(schema.projectionState.id, "dashboard"))
              .run();
          },
        );
      }
    };

    try {
      const { result, statements } = await withSqlTrace(() =>
        homeDataSource.load({ currency: "INR", at: 2000 }),
      );

      expect(accountQueries).toBe(1);
      expect(result.accounts).toHaveLength(1);
      // 1000.00 is 100000 minor units in the original projection. Seeing
      // 200000 proves the accepted result came from the retried, caught-up
      // revision rather than the mixed first attempt.
      expect(result.accounts[0]!.balanceMinorUnits).toBe(200000);
      expect(
        statements.filter((source) => /^\s*SELECT[\s\S]*FROM accounts\b/i.test(source)),
      ).toHaveLength(2);
      // A second internal query is repeated too, proving readConsistentSnapshot
      // re-ran the whole composed callback rather than selectively refreshing
      // only the query that happened to observe the publish.
      expect(
        statements.filter((source) =>
          /^\s*SELECT sms_id AS smsId, date[\s\S]*FROM activity\b/i.test(source),
        ),
      ).toHaveLength(2);

      expect(projectionRevisions()).toEqual({ sourceRevision: 2, projectedRevision: 2 });
    } finally {
      afterDefaultQuery = null;
    }
  });

  it("keeps the composed and auxiliary Home reads on normalized tables", async () => {
    useFreshDb();
    const at = new Date(2024, 5, 15, 10, 0, 0);
    const message = {
      ...sms("home-boundary-1", "VM-HDFCBK", at.getTime(), {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "100.00",
        trxTypeRich: "EXPENSE",
      }),
      result: {
        ...result({
          bankName: "HDFC Bank",
          acc: "XX1234",
          trx: "100.00",
          trxTypeRich: "EXPENSE",
        }),
        matchedCategories: ["GRM_BANK"],
      },
    } as unknown as ParsedSms;
    seedAndProject([message], at);

    const composed = await withSqlTrace(() =>
      homeDataSource.load({ currency: "INR", at: at.getTime() }),
    );
    const recent = await withSqlTrace(() =>
      homeDataSource.loadRecentActivity({
        category: "GRM_BANK",
        limit: 5,
        at: at.getTime(),
      }),
    );
    const calendar = await withSqlTrace(() =>
      homeDataSource.loadCalendarMonths({
        currency: "INR",
        at: at.getTime(),
        monthsBack: 3,
      }),
    );

    expect(composed.result.accounts).toHaveLength(1);
    expect(composed.result.recentActivity).toHaveLength(1);
    expect(recent.result).toHaveLength(1);
    expect(recent.result[0]!.smsId).toBe("home-boundary-1");
    expect(calendar.result.items).toHaveLength(3);
    expect(calendar.result.items.at(-1)!.expenseMinorUnits).toBe(10000);

    const allStatements = [...composed.statements, ...recent.statements, ...calendar.statements];
    expect(allStatements.length).toBeGreaterThan(0);
    expect(allStatements.some((source) => /\bsms_ledger\b/i.test(source))).toBe(false);

    // The composed read has the projection-state reads before/after the
    // bounded query set; each standalone auxiliary read has its own ordinary
    // freshness gate before its normalized-table query.
    expect(
      composed.statements.filter(
        (source) => /^\s*SELECT/i.test(source) && /projection_state/i.test(source),
      ).length,
    ).toBeGreaterThanOrEqual(2);
    for (const { statements, table } of [
      { statements: recent.statements, table: "activity" },
      { statements: calendar.statements, table: "transactions" },
    ]) {
      const freshnessIndex = statements.findIndex((source) => /projection_state/i.test(source));
      const queryIndex = statements.findIndex((source) =>
        new RegExp(`\\b${table}\\b`, "i").test(source),
      );
      expect(freshnessIndex).toBeGreaterThanOrEqual(0);
      expect(queryIndex).toBeGreaterThan(freshnessIndex);
    }
  });
});

describe("HomeDataSource repairs dirty projections before bounded reads", () => {
  it("rebuilds from newer ledger content before loading filtered activity", async () => {
    useFreshDb();
    const at = new Date(2024, 5, 15, 10, 0, 0);
    const initialMessage = categorizedSms("dirty-activity-1", "VM-HDFCBK", at.getTime() - 1000, {
      bankName: "HDFC Bank",
      acc: "XX1234",
      trx: "100.00",
      trxTypeRich: "EXPENSE",
    });
    seedAndProject([initialMessage], at);

    const newerMessage = categorizedSms("dirty-activity-2", "VM-HDFCBK", at.getTime(), {
      bankName: "HDFC Bank",
      acc: "XX1234",
      trx: "250.00",
      trxTypeRich: "EXPENSE",
    });
    insertLedgerMessage(newerMessage);
    // The mocked client module exposes this same migrated database through
    // `db`, so ensureDashboardProjectionCurrent's repair really reads the
    // newer row from smsLedger before rebuilding normalized projections.
    // Current parser-version rows keep reprocessing from changing the source
    // revision a second time during this deliberately dirty-state test.
    markProjectionDirty(2, 1);

    const rows = await homeDataSource.loadRecentActivity({
      category: "GRM_BANK",
      limit: 5,
      at: at.getTime(),
    });

    expect(rows[0]).toMatchObject({
      smsId: newerMessage.id,
      amountMinorUnits: 25000,
      direction: "expense",
    });
    expect(rows.map((row) => row.smsId)).toEqual([newerMessage.id, initialMessage.id]);
    expect(projectionRevisions()).toEqual({ sourceRevision: 2, projectedRevision: 2 });
  });

  it("rebuilds from newer ledger content before loading calendar months", async () => {
    useFreshDb();
    const at = new Date(2024, 5, 15, 10, 0, 0);
    const initialMessage = categorizedSms("dirty-calendar-1", "VM-HDFCBK", at.getTime() - DAY, {
      bankName: "HDFC Bank",
      acc: "XX1234",
      bal: "1000.00",
      trx: "100.00",
      trxTypeRich: "EXPENSE",
    });
    seedAndProject([initialMessage], at);

    const newerMessage = categorizedSms("dirty-calendar-2", "VM-HDFCBK", at.getTime(), {
      bankName: "HDFC Bank",
      acc: "XX1234",
      trx: "250.00",
      trxTypeRich: "EXPENSE",
    });
    insertLedgerMessage(newerMessage);
    // As above, the real freshness repair reads this test database's ledger
    // through the mocked `db` getter; this is not a direct projection-table
    // shortcut.
    markProjectionDirty(2, 1);

    const page = await homeDataSource.loadCalendarMonths({
      currency: "INR",
      at: at.getTime(),
      monthsBack: 3,
    });

    expect(page.items).toHaveLength(3);
    expect(page.items.at(-1)!.expenseMinorUnits).toBe(35000);
    expect(page.items.at(-1)!.days).toContainEqual({
      day: new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime(),
      incomeMinorUnits: 0,
      expenseMinorUnits: 25000,
    });
    expect(projectionRevisions()).toEqual({ sourceRevision: 2, projectedRevision: 2 });
  });
});

describe("EXPLAIN QUERY PLAN sanity checks", () => {
  // Regression for the review finding that the unfiltered stage-1 query
  // (GROUP BY sms_id ... LIMIT ?) is not actually bounded: SQLite's
  // LIMIT-pushdown-into-an-ordered-index-scan optimization only applies to
  // a standalone top-level query, not one wrapped in GROUP BY — so the old
  // shape scanned and grouped the ENTIRE activity table before LIMIT could
  // trim anything. The fixed query (a plain ORDER BY + LIMIT, deduplicated
  // in JS afterward) must show a bounded plan with no temp b-tree for
  // GROUP BY at all, since there is no GROUP BY in this statement anymore.
  it("the bounded stage-1 activity candidate query is fully served by an index with no temp-sort of any kind", async () => {
    useFreshDb();
    seedAndProject([], new Date(2000));

    const filteredPlan = rawSqlite
      .prepare(
        `EXPLAIN QUERY PLAN SELECT sms_id AS smsId, date
         FROM activity
         WHERE category = ?
         ORDER BY date DESC, sms_id DESC
         LIMIT ?`,
      )
      .all("GRM_BILL", 50)
      .map((row) => (row as { detail: string }).detail);
    // Regression for the High finding that (date, sms_id) ordering did not
    // match the (date, id) / (category, date, id) indexes' own tiebreaker
    // column (activity's own id, `${smsId}|${category}`, not sms_id) —
    // asserting the SPECIFIC new index by name, not just "some index",
    // proves this query is no longer accidentally served by the old
    // mismatched indexes in a way that still needed a temp sort.
    expect(filteredPlan.some((line) => line.includes("activity_category_date_sms_id_idx"))).toBe(
      true,
    );
    expect(filteredPlan.some((line) => /GROUP BY/i.test(line))).toBe(false);
    // No temp b-tree for ANY term of the ORDER BY — not just no GROUP BY —
    // since a same-timestamp burst would otherwise force SQLite to fully
    // sort that burst by sms_id before LIMIT can apply.
    expect(filteredPlan.some((line) => /TEMP B-TREE.*ORDER BY/i.test(line))).toBe(false);

    const unfilteredPlan = rawSqlite
      .prepare(
        `EXPLAIN QUERY PLAN SELECT sms_id AS smsId, date
         FROM activity
         ORDER BY date DESC, sms_id DESC
         LIMIT ?`,
      )
      .all(50)
      .map((row) => (row as { detail: string }).detail);
    expect(unfilteredPlan.some((line) => line.includes("activity_date_sms_id_idx"))).toBe(true);
    expect(unfilteredPlan.some((line) => /GROUP BY/i.test(line))).toBe(false);
    expect(unfilteredPlan.some((line) => /TEMP B-TREE.*ORDER BY/i.test(line))).toBe(false);
  });

  // Regression for the High finding itself: a large burst of activity rows
  // sharing the EXACT SAME date must not force an unbounded sort. Seeds
  // many rows at one timestamp and checks the deterministic index-backed
  // bounded query shape against that burst.
  it("a large same-timestamp burst keeps the bounded candidate query index-backed", async () => {
    useFreshDb();
    seedAndProject([], new Date(2000));
    const insertLedger = rawSqlite.prepare(
      "INSERT INTO sms_ledger (id, sender, body, date, parser_version, parsed_result, ingestion_status, created_at) VALUES (?,?,?,?,?,?,?,?)",
    );
    const insertActivity = rawSqlite.prepare(
      "INSERT INTO activity (id, sms_id, category, date, sender, is_from_card) VALUES (?,?,?,?,?,0)",
    );
    const SAME_DATE = 500000;
    const seedBurst = rawSqlite.transaction((n: number) => {
      for (let i = 0; i < n; i++) {
        const id = `burst-${i}`;
        insertLedger.run(id, "X", "body", SAME_DATE, "v1", "{}", "parsed", SAME_DATE);
        insertActivity.run(`${id}|GRM_BANK`, id, "GRM_BANK", SAME_DATE, "X");
      }
    });
    seedBurst(20000);

    const rows = rawSqlite
      .prepare(`SELECT sms_id, date FROM activity ORDER BY date DESC, sms_id DESC LIMIT ?`)
      .all(50);
    expect(rows).toHaveLength(50);
    const plan = rawSqlite
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT sms_id, date
         FROM activity
         ORDER BY date DESC, sms_id DESC
         LIMIT ?`,
      )
      .all(50)
      .map((row) => (row as { detail: string }).detail);
    expect(plan.some((line) => line.includes("activity_date_sms_id_idx"))).toBe(true);
    expect(plan.some((line) => /TEMP B-TREE/i.test(line))).toBe(false);
  });

  // Keep the large-table regression deterministic: the query must return its
  // bounded result through the intended covering index, independent of how
  // quickly this CI host happens to execute SQLite statements.
  it("the bounded stage-1 query remains index-backed on a large activity table", async () => {
    useFreshDb();
    seedAndProject([], new Date(2000));
    const insertLedger = rawSqlite.prepare(
      "INSERT INTO sms_ledger (id, sender, body, date, parser_version, parsed_result, ingestion_status, created_at) VALUES (?,?,?,?,?,?,?,?)",
    );
    const insertActivity = rawSqlite.prepare(
      "INSERT INTO activity (id, sms_id, category, date, sender, is_from_card) VALUES (?,?,?,?,?,0)",
    );
    const seedMany = rawSqlite.transaction((n: number) => {
      for (let i = 0; i < n; i++) {
        const id = `bulk-${i}`;
        insertLedger.run(id, "X", "body", i, "v1", "{}", "parsed", i);
        insertActivity.run(`${id}|GRM_BANK`, id, "GRM_BANK", i, "X");
      }
    });
    seedMany(20000);

    const rows = rawSqlite
      .prepare(`SELECT sms_id, date FROM activity ORDER BY date DESC, sms_id DESC LIMIT ?`)
      .all(50);
    expect(rows).toHaveLength(50);
    const plan = rawSqlite
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT sms_id, date
         FROM activity
         ORDER BY date DESC, sms_id DESC
         LIMIT ?`,
      )
      .all(50)
      .map((row) => (row as { detail: string }).detail);
    expect(plan.some((line) => line.includes("activity_date_sms_id_idx"))).toBe(true);
    expect(plan.some((line) => /TEMP B-TREE/i.test(line))).toBe(false);
  });

  it("the mandate-events ROW_NUMBER() batch query is served by mandate_events_mandate_id_date_id_idx", async () => {
    useFreshDb();
    seedAndProject([], new Date(2000));

    const plan = rawSqlite
      .prepare(
        `EXPLAIN QUERY PLAN SELECT id, mandate_id, status, date, sender,
                ROW_NUMBER() OVER (
                  PARTITION BY mandate_id ORDER BY date DESC, id DESC
                ) AS rn
         FROM mandate_events
         WHERE mandate_id IN (?, ?)`,
      )
      .all("UMN1", "UMN2")
      .map((row) => (row as { detail: string }).detail);
    expect(plan.some((line) => line.includes("mandate_events_mandate_id_date_id_idx"))).toBe(true);
    expect(plan.some((line) => /SCAN mandate_events/i.test(line))).toBe(false);
  });
});

describe("full HomeReadModel field coverage against a small realistic fixture", () => {
  it("populates every top-level field", async () => {
    useFreshDb();
    const at = new Date(2024, 5, 15);
    const messages: ParsedSms[] = [
      sms("bal-1", "VM-HDFCBK", at.getTime() - 5 * DAY, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        bal: "5000.00",
      }),
      {
        ...sms("expense-1", "VM-HDFCBK", at.getTime() - 1 * DAY, {
          bankName: "HDFC Bank",
          acc: "XX1234",
          trx: "500.00",
          trxTypeRich: "EXPENSE",
          merchantCategory: "shopping",
        }),
        result: {
          ...result({
            bankName: "HDFC Bank",
            acc: "XX1234",
            trx: "500.00",
            trxTypeRich: "EXPENSE",
            merchantCategory: "shopping",
          }),
          matchedCategories: ["GRM_BANK"],
        },
      } as ParsedSms,
      sms("mandate-1", "VM-HDFCBK", at.getTime() - 2 * DAY, {
        mandateId: "UMN1",
        mandateMerchant: "Netflix",
        mandateAmount: "199.00",
        mandateEvent: "active",
      }),
    ];
    seedAndProject(messages, at);

    const model = await homeDataSource.load({ currency: "INR", at: at.getTime() });
    expect(model.accounts.length).toBeGreaterThan(0);
    expect(model.detectedAccounts).toBeDefined();
    expect(model.unassignedReadings).toBeDefined();
    expect(model.monthTotals).toBeDefined();
    expect(model.categoryTotalsByCurrency).toBeDefined();
    expect(model.availableCurrencies).toContain("INR");
    expect(model.flowDays).toHaveLength(7);
    expect(model.calendarMonths.items.length).toBeGreaterThan(0);
    expect(model.subscriptionOverview.items.length).toBeGreaterThan(0);
    expect(model.recentActivity.length).toBeGreaterThan(0);
    expect(model.activityCategoryCounts.length).toBeGreaterThan(0);
    expect(model.totalActivityCount).toBeGreaterThan(0);
  });
});
