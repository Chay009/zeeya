// Runs against a real SQLite database (better-sqlite3, same approach as
// ingestion.test.ts) rather than mocking drizzle — replaceProjection's
// whole job is writing rows that satisfy this schema's real foreign
// keys/unique indexes/check constraints, so a mocked instance wouldn't
// actually prove anything about it. Calls replaceProjection directly
// with precise Dashboard fixtures (built the same way lib/dashboard.test.ts
// builds them) rather than driving everything through real SMS parsing —
// this module's own contract is "given this Dashboard, write these rows,"
// independent of how the parser produced that Dashboard.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { describe, it, expect } from "vitest";
import type { MalanaResult } from "@zeeya/parser/malana";
import { deriveDashboardProjection } from "../lib/dashboard";
import type { ParsedSms } from "../lib/sms";
import { fromMinorUnits } from "../lib/currency";
import { normalizeMerchant } from "../lib/subscriptions";
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
  return drizzle(sqlite, { schema });
}

// Same minimal-MalanaResult-builder approach as lib/dashboard.test.ts —
// only the fields a given test actually exercises are set.
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

// Every FK this module writes (balance_readings.sms_id, transactions.sms_id,
// activity.sms_id, mandate_events.sms_id) references sms_ledger.id — a real
// invariant ingestSmsBatch always satisfies (it writes the ledger row
// before deriving the Dashboard these projections come from), so these
// direct-fixture tests reproduce that same invariant rather than relying
// on replaceProjection to tolerate a ledger row that doesn't exist yet.
function seedLedger(db: ReturnType<typeof freshDb>, messages: ParsedSms[]): void {
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

describe("replaceProjection", () => {
  it("projects a reported account balance into the accounts table", () => {
    const db = freshDb();
    const messages: ParsedSms[] = [
      sms("balance-1", "VM-TEST", 1000, {
        bankName: "Test Bank",
        bal: "12500.00",
        acc: "XX1234",
      }),
    ];
    seedLedger(db, messages);
    const projection = deriveDashboardProjection(messages, new Date(2000));

    replaceProjection(db, projection);

    const rows = db.select().from(schema.accounts).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      bankName: "Test Bank",
      last4: "1234",
      currency: "INR",
    });
    expect(rows[0]!.balanceMinorUnits).not.toBeNull();
    expect(fromMinorUnits(rows[0]!.balanceMinorUnits!, "INR")).toBe(12500);
  });

  it("links a balance reading to its originating sms via the real ledger id, not a heuristic match", () => {
    const db = freshDb();
    const messages: ParsedSms[] = [
      // Two readings sharing the exact same date and sender — a
      // date+sender heuristic could not tell these apart; only carrying
      // the real smsId through from deriveDashboard can.
      sms("first-reading", "VM-TEST", 5000, {
        bankName: "Test Bank",
        bal: "100.00",
        acc: "XX1111",
      }),
      sms("second-reading", "VM-TEST", 5000, {
        bankName: "Test Bank",
        bal: "200.00",
        acc: "XX2222",
      }),
    ];
    seedLedger(db, messages);
    const projection = deriveDashboardProjection(messages, new Date(6000));

    replaceProjection(db, projection);

    const readings = db.select().from(schema.balanceReadings).all();
    expect(readings).toHaveLength(2);
    expect(readings.map((r) => r.id).sort()).toEqual(["first-reading", "second-reading"]);
    expect(readings.map((r) => r.smsId).sort()).toEqual(["first-reading", "second-reading"]);
  });

  it("projects a recognized transaction with the correct direction and minor units", () => {
    const db = freshDb();
    const messages: ParsedSms[] = [
      sms("expense-1", "VM-TEST", 1000, {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "199.50",
        trxTypeRich: "EXPENSE",
      }),
    ];
    seedLedger(db, messages);
    const projection = deriveDashboardProjection(messages, new Date(2000));

    replaceProjection(db, projection);

    const rows = db.select().from(schema.transactions).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.direction).toBe("expense");
    expect(fromMinorUnits(rows[0]!.amountMinorUnits, "INR")).toBe(199.5);
  });

  it("projects subscriptionIdentityKey as the exact same normalizeMerchant()+currency composite the subscriptions table's own id uses", () => {
    const db = freshDb();
    const messages: ParsedSms[] = [
      sms("brand-1", "VM-TEST", 1000, {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "100.00",
        trxTypeRich: "EXPENSE",
        brandName: "  Netflix.com  ",
        currency: "INR",
      }),
      sms("vendor-1", "VM-TEST", 2000, {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "200.00",
        trxTypeRich: "EXPENSE",
        brandName: null,
        vendor: "Some Vendor Inc",
        currency: "USD",
      }),
      sms("neither-1", "VM-TEST", 3000, {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "300.00",
        trxTypeRich: "EXPENSE",
        brandName: null,
        vendor: null,
      }),
    ];
    seedLedger(db, messages);
    const projection = deriveDashboardProjection(messages, new Date(4000));

    replaceProjection(db, projection);

    const rows = db.select().from(schema.transactions).all();
    const byId = new Map(rows.map((row) => [row.id, row]));

    // The exact composite format subscriptions.id already uses — a plain
    // equality join between the two tables is only correct if this is a
    // literal string match, not just "the merchant part happens to be
    // right." Currency is required in the key: two different currencies'
    // identically-named merchants must never collide.
    expect(byId.get("brand-1")!.subscriptionIdentityKey).toBe(
      `${normalizeMerchant("  Netflix.com  ")}|INR`,
    );
    expect(byId.get("brand-1")!.subscriptionIdentityKey).toBe("netflix|INR");

    // Falls back to vendor when brandName is absent, still with currency
    // appended.
    expect(byId.get("vendor-1")!.subscriptionIdentityKey).toBe(
      `${normalizeMerchant("Some Vendor Inc")}|USD`,
    );

    // Neither brandName nor vendor present — null, never a fallback to
    // bankName or any other field (a bankName fallback would silently
    // create false subscription matches), and never a degenerate
    // "|INR"-shaped key with an empty merchant half.
    expect(byId.get("neither-1")!.subscriptionIdentityKey).toBeNull();
  });

  it("projects subscriptionIdentityKey as null when the only merchant name normalizes to an empty string", () => {
    const db = freshDb();
    const messages: ParsedSms[] = [
      sms("symbols-only-1", "VM-TEST", 1000, {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "100.00",
        trxTypeRich: "EXPENSE",
        // normalizeMerchant strips non-alphanumeric characters entirely —
        // "---" has nothing left after that, so it must resolve to null,
        // never a degenerate "|INR" key with an empty merchant half that
        // could accidentally equal another empty-normalized merchant's key.
        brandName: "---",
      }),
    ];
    seedLedger(db, messages);
    const projection = deriveDashboardProjection(messages, new Date(2000));

    replaceProjection(db, projection);

    const rows = db.select().from(schema.transactions).all();
    expect(rows).toHaveLength(1);
    expect(normalizeMerchant("---")).toBe("");
    expect(rows[0]!.subscriptionIdentityKey).toBeNull();
  });

  it("links a transaction to its exact account when one bank has multiple accounts", () => {
    const db = freshDb();
    const messages: ParsedSms[] = [
      sms("balance-1111", "VM-TEST", 1000, {
        bankName: "Test Bank",
        bal: "1000.00",
        acc: "XX1111",
      }),
      sms("balance-2222", "VM-TEST", 1001, {
        bankName: "Test Bank",
        bal: "2000.00",
        acc: "XX2222",
      }),
      sms("expense-2222", "VM-TEST", 2000, {
        bankName: "Test Bank",
        acc: "XX2222",
        trx: "50.00",
        trxTypeRich: "EXPENSE",
      }),
    ];
    seedLedger(db, messages);
    const projection = deriveDashboardProjection(messages, new Date(3000));

    replaceProjection(db, projection);

    const row = db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.smsId, "expense-2222"))
      .get();
    expect(row?.accountId).toBe("test bank|2222");
  });

  it("projects subcategory alongside merchantCategory, both independently, on the transactions row", () => {
    const db = freshDb();
    const messages: ParsedSms[] = [
      sms("upi-transfer", "VM-TEST", 1000, {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "40.00",
        trxTypeRich: "EXPENSE",
        merchantCategory: null,
        subcategory: "upi",
      }),
    ];
    seedLedger(db, messages);
    const projection = deriveDashboardProjection(messages, new Date(2000));

    replaceProjection(db, projection);

    const rows = db.select().from(schema.transactions).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.merchantCategory).toBeNull();
    expect(rows[0]!.subcategory).toBe("upi");
  });

  it("projects an income transaction as direction 'income', not just literal trxTypeRich strings", () => {
    const db = freshDb();
    const messages: ParsedSms[] = [
      // SALARY maps to "income" via trxDirection's own table, not a
      // literal "INCOME" string match — this is exactly the bug a naive
      // reimplementation of that mapping would get wrong.
      sms("salary-1", "VM-TEST", 1000, {
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "50000.00",
        trxTypeRich: "SALARY",
      }),
    ];
    seedLedger(db, messages);
    const projection = deriveDashboardProjection(messages, new Date(2000));

    replaceProjection(db, projection);

    const rows = db.select().from(schema.transactions).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.direction).toBe("income");
  });

  it("projects one activity row per matched product category, excluding non-product categories", () => {
    const db = freshDb();
    const messages: ParsedSms[] = [
      sms("travel-1", "VM-TEST", 1000, {
        category: "GRM_TRAVEL",
        // GRM_TELECOM is a real matchedCategories entry here but is
        // excluded from activity projection the same way
        // lib/activity-filters.ts excludes it from the UI's own category
        // list (ProductActivityCategory excludes GRM_VOID/GRM_CALLALERTS/
        // GRM_TELECOM specifically).
        matchedCategories: ["GRM_TRAVEL", "GRM_TELECOM"],
        pnr: "ABC123",
      }),
    ];
    seedLedger(db, messages);
    const projection = deriveDashboardProjection(messages, new Date(2000));

    replaceProjection(db, projection);

    const rows = db.select().from(schema.activity).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.category).toBe("GRM_TRAVEL");
    expect(rows[0]!.smsId).toBe("travel-1");
  });

  it("projects a mandate and its event history with real smsIds, not guessed ones", () => {
    const db = freshDb();
    const messages: ParsedSms[] = [
      sms("mandate-created", "VM-TEST", 1000, {
        mandateId: "umn-1",
        mandateMerchant: "Netflix",
        mandateAmount: "499.00",
        mandateEvent: "active",
      }),
      sms("mandate-cancelled", "VM-TEST", 2000, {
        mandateId: "umn-1",
        mandateMerchant: "Netflix",
        mandateAmount: "499.00",
        mandateEvent: "cancelled",
      }),
    ];
    seedLedger(db, messages);
    const projection = deriveDashboardProjection(messages, new Date(3000));

    replaceProjection(db, projection);

    const mandateRows = db.select().from(schema.mandates).all();
    expect(mandateRows).toHaveLength(1);
    expect(mandateRows[0]!.status).toBe("cancelled");

    const eventRows = db
      .select()
      .from(schema.mandateEvents)
      .where(eq(schema.mandateEvents.mandateId, "umn-1"))
      .all();
    expect(eventRows.map((e) => e.smsId).sort()).toEqual(["mandate-cancelled", "mandate-created"]);
  });

  it("fully replaces prior projection rows rather than accumulating stale ones across calls", () => {
    const db = freshDb();
    const firstMessages = [
      sms("only-reading", "VM-TEST", 1000, { bankName: "Test Bank", bal: "100.00", acc: "XX1234" }),
    ];
    seedLedger(db, firstMessages);
    const first = deriveDashboardProjection(firstMessages, new Date(2000));
    replaceProjection(db, first);
    expect(db.select().from(schema.accounts).all()).toHaveLength(1);

    // A second, independent derivation (e.g. a later ingest run) with no
    // accounts at all — the projection must not still show the first
    // account as if it still existed.
    const second = deriveDashboardProjection([], new Date(3000));
    replaceProjection(db, second);

    expect(db.select().from(schema.accounts).all()).toHaveLength(0);
    expect(db.select().from(schema.balanceReadings).all()).toHaveLength(0);
  });

  it("skips a transaction whose amount string this currency's rules cannot represent, without throwing", () => {
    const db = freshDb();
    const messages: ParsedSms[] = [
      sms("malformed-amount", "VM-TEST", 1000, {
        bankName: "Test Bank",
        acc: "XX1234",
        // More decimal precision than INR's 2-decimal-place minor unit
        // can represent — toMinorUnits would throw for this string.
        trx: "199.999",
        trxTypeRich: "EXPENSE",
      }),
    ];
    seedLedger(db, messages);
    const projection = deriveDashboardProjection(messages, new Date(2000));

    expect(() => replaceProjection(db, projection)).not.toThrow();
    expect(db.select().from(schema.transactions).all()).toHaveLength(0);
  });

  // deriveSubscriptions's own `count` field reports the FULL qualifying
  // run, not a bounded recent window — this is the exact behaviour a
  // 150-day-bounded read-time approach would have silently truncated
  // (see the schema.ts comment on why subscriptions are persisted rather
  // than recomputed from a bounded window). Twenty-four consecutive
  // ~30-day charges is nearly two years of history, well past 150 days.
  it("projects a subscription's full multi-year occurrence count, not a bounded recent window", () => {
    const db = freshDb();
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
    seedLedger(db, messages);
    // "now" is the same run's last charge date, so the whole run is still
    // within RECENCY_WINDOW_DAYS and none of it gets excluded on recency.
    const now = new Date(messages[messages.length - 1]!.date);
    const projection = deriveDashboardProjection(messages, now);
    expect(projection.dashboard.subscriptions).toHaveLength(1);
    expect(projection.dashboard.subscriptions[0]!.count).toBe(occurrenceCount);

    replaceProjection(db, projection);

    const rows = db.select().from(schema.subscriptions).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.count).toBe(occurrenceCount);
    expect(rows[0]!.merchant).toBe("Netflix");
    expect(rows[0]!.confidence).toBe("likely");
    expect(fromMinorUnits(rows[0]!.amountMinorUnits, "INR")).toBeCloseTo(649, 2);
    expect(rows[0]!.lastDate).toBe(messages[messages.length - 1]!.date);

    // Cross-table proof, not just "each side individually matches the
    // shared helper's output": every one of this merchant's real
    // transactions.subscriptionIdentityKey values equals this exact
    // subscriptions row's own primary key — the plain equality join
    // Home's isRecurring (see dashboard-data.ts) depends on only works if
    // this genuinely holds through the real write path, not just in
    // isolated unit tests of the shared helper.
    const transactionRows = db.select().from(schema.transactions).all();
    expect(transactionRows).toHaveLength(occurrenceCount);
    for (const row of transactionRows) {
      expect(row.subscriptionIdentityKey).toBe(rows[0]!.id);
    }
  });

  it("keeps mandate-backed recurring payments out of the subscriptions projection", () => {
    const db = freshDb();
    // A mandateId present on every occurrence means deriveSubscriptions
    // excludes it entirely (it belongs in mandates/mandate_events instead)
    // — this is the non-overlap the schema comment calls out explicitly.
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
    seedLedger(db, messages);
    const now = new Date(messages[messages.length - 1]!.date);
    const projection = deriveDashboardProjection(messages, now);
    expect(projection.dashboard.mandates).toHaveLength(1);
    expect(projection.dashboard.subscriptions).toHaveLength(0);

    replaceProjection(db, projection);

    expect(db.select().from(schema.mandates).all()).toHaveLength(1);
    expect(db.select().from(schema.subscriptions).all()).toHaveLength(0);
  });

  it("fully replaces subscriptions rows across calls, same as every other projected table", () => {
    const db = freshDb();
    const startDate = new Date(2024, 0, 5).getTime();
    const firstMessages: ParsedSms[] = Array.from({ length: 3 }, (_, index) =>
      sms(`gym-${index}`, "VM-HDFCBK", startDate + index * 30 * 24 * 60 * 60 * 1000, {
        bankName: "HDFC Bank",
        acc: "XX1234",
        trx: "1200.00",
        trxTypeRich: "EXPENSE",
        brandName: "Cult Fit",
        currency: "INR",
      }),
    );
    seedLedger(db, firstMessages);
    const firstNow = new Date(firstMessages[firstMessages.length - 1]!.date);
    const first = deriveDashboardProjection(firstMessages, firstNow);
    replaceProjection(db, first);
    expect(db.select().from(schema.subscriptions).all()).toHaveLength(1);

    // A later derivation with no subscription-eligible messages at all —
    // the stale Cult Fit row must not survive.
    const second = deriveDashboardProjection([], new Date(firstNow.getTime() + 1));
    replaceProjection(db, second);

    expect(db.select().from(schema.subscriptions).all()).toHaveLength(0);
  });
});
