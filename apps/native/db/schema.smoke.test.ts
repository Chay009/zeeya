// Verifies real SQLite behavior that typechecking and drizzle-kit generate
// cannot: that the generated migration actually applies, that foreign keys
// are enforced once initializeNativeDatabase runs (the exact function
// db/client.native.ts calls in production — not a re-implementation of it),
// and that the CHECK constraints reject the values they're meant to reject.
// Runs against better-sqlite3 in Node — the schema/migration SQL is driver-
// agnostic, only db/client.native.ts's connection is Expo-specific, so this
// needs no device or Expo runtime.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "./schema";
import { initializeNativeDatabase } from "./native-init";

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

function applyMigrations(sqlite: Database.Database) {
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
}

// initializeNativeDatabase only needs an execSync(source) method — see
// native-init.ts's minimal ExecSyncCapable interface — so this adapts
// better-sqlite3's .exec() without an unsafe cast to expo-sqlite's much
// larger SQLiteDatabase type. Still calls the real, unmodified production
// function, not a reimplementation of what it does.
//
// Forces foreign_keys OFF before calling it: better-sqlite3 compiles with
// foreign_keys=1 by default (see freshUninitializedDb's comment below), so
// without this reset, every test using this helper would keep passing even
// if initializeNativeDatabase were emptied out — the driver's own default
// would carry the enforcement, not the function under test.
function freshInitializedDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = OFF");
  applyMigrations(sqlite);
  initializeNativeDatabase({ execSync: (source: string) => sqlite.exec(source) });
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

// Isolates the "what if the pragma call is deleted" case without touching
// initializeNativeDatabase — better-sqlite3 happens to compile SQLite with
// foreign_keys=1 by default (confirmed directly:
// `new Database(':memory:').pragma('foreign_keys')` returns 1 with no
// pragma call at all), unlike the classic SQLite default of off. Explicitly
// forcing it off here is what makes the "cascade doesn't happen" assertion
// below prove the mechanism, not coincidentally pass due to the test
// runner's own SQLite build.
function freshUninitializedDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = OFF");
  applyMigrations(sqlite);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

describe("local SQLite schema", () => {
  let ctx: ReturnType<typeof freshInitializedDb>;

  beforeEach(() => {
    ctx = freshInitializedDb();
  });

  it("does NOT cascade when the database is never initialized — proves the case below is initializeNativeDatabase, not a driver default", () => {
    const uninitialized = freshUninitializedDb();
    uninitialized.db
      .insert(schema.smsLedger)
      .values({
        id: "sms-off",
        sender: "VM-HDFCBK",
        body: "test",
        date: 1000,
        parserVersion: "1.0.0",
        parsedResult: "{}",
        ingestionStatus: "parsed",
        createdAt: 1000,
      })
      .run();
    uninitialized.db
      .insert(schema.transactions)
      .values({
        id: "trx-off",
        smsId: "sms-off",
        amountMinorUnits: 10000,
        currency: "INR",
        direction: "expense",
        date: 1000,
      })
      .run();

    uninitialized.db
      .delete(schema.smsLedger)
      .where(sql`id = 'sms-off'`)
      .run();

    // Orphaned, not cascaded — this is what would happen in production if
    // client.native.ts stopped calling initializeNativeDatabase.
    expect(uninitialized.db.select().from(schema.transactions).all()).toHaveLength(1);
  });

  it("initializeNativeDatabase actually turns foreign_keys on, not just relying on a default", () => {
    // freshInitializedDb forces the pragma off first (see its own comment),
    // so this can only read 1 if initializeNativeDatabase itself set it.
    expect(ctx.sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("applies the generated migration cleanly and creates every table", () => {
    const tables = ctx.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "accounts",
        "activity",
        "balance_readings",
        "identity_conflicts",
        "mandate_events",
        "mandates",
        "sms_ledger",
        "sync_checkpoint",
        "transactions",
      ].sort(),
    );
  });

  it("enforces foreign keys via initializeNativeDatabase (cascade delete)", () => {
    ctx.db
      .insert(schema.smsLedger)
      .values({
        id: "sms-1",
        sender: "VM-HDFCBK",
        body: "test",
        date: 1000,
        parserVersion: "1.0.0",
        parsedResult: "{}",
        ingestionStatus: "parsed",
        createdAt: 1000,
      })
      .run();
    ctx.db
      .insert(schema.transactions)
      .values({
        id: "trx-1",
        smsId: "sms-1",
        amountMinorUnits: 10000,
        currency: "INR",
        direction: "expense",
        date: 1000,
      })
      .run();

    expect(ctx.db.select().from(schema.transactions).all()).toHaveLength(1);

    ctx.db
      .delete(schema.smsLedger)
      .where(sql`id = 'sms-1'`)
      .run();

    // Cascade only fires when the connection actually enforces FKs — this
    // is the exact behavior initializeNativeDatabase exists to guarantee.
    expect(ctx.db.select().from(schema.transactions).all()).toHaveLength(0);
  });

  it("rejects a foreign key insert with no matching parent row", () => {
    expect(() =>
      ctx.db
        .insert(schema.transactions)
        .values({
          id: "trx-orphan",
          smsId: "does-not-exist",
          amountMinorUnits: 5000,
          currency: "INR",
          direction: "expense",
          date: 1000,
        })
        .run(),
    ).toThrow(/FOREIGN KEY constraint failed/);
  });

  describe("sms_ledger_parsed_result_matches_status", () => {
    // Each case below violates exactly one clause of the CHECK — a "parsed"
    // row with both parsedResult present and ingestionError absent would
    // already violate two clauses if it also had a bad parsedResult, which
    // wouldn't prove which clause the constraint is actually catching.
    const baseRow = {
      sender: "VM-HDFCBK",
      body: "test",
      date: 1000,
      parserVersion: "1.0.0",
      createdAt: 1000,
    };

    it("accepts a valid parsed row (result present, error absent)", () => {
      expect(() =>
        ctx.db
          .insert(schema.smsLedger)
          .values({
            ...baseRow,
            id: "sms-valid-parsed",
            parsedResult: "{}",
            ingestionStatus: "parsed",
          })
          .run(),
      ).not.toThrow();
    });

    it("accepts a valid error row (result absent, error present)", () => {
      expect(() =>
        ctx.db
          .insert(schema.smsLedger)
          .values({
            ...baseRow,
            id: "sms-valid-error",
            parsedResult: null,
            ingestionStatus: "error",
            ingestionError: "boom",
          })
          .run(),
      ).not.toThrow();
    });

    it("rejects status=parsed with parsedResult null (only that clause violated)", () => {
      expect(() =>
        ctx.db
          .insert(schema.smsLedger)
          .values({
            ...baseRow,
            id: "sms-bad-missing-result",
            parsedResult: null,
            ingestionStatus: "parsed",
            ingestionError: null,
          })
          .run(),
      ).toThrow(/CHECK constraint failed/);
    });

    it("rejects status=parsed with an ingestionError present (only that clause violated)", () => {
      expect(() =>
        ctx.db
          .insert(schema.smsLedger)
          .values({
            ...baseRow,
            id: "sms-bad-stray-error",
            parsedResult: "{}",
            ingestionStatus: "parsed",
            ingestionError: "boom",
          })
          .run(),
      ).toThrow(/CHECK constraint failed/);
    });

    it("rejects status=error with parsedResult present (only that clause violated)", () => {
      expect(() =>
        ctx.db
          .insert(schema.smsLedger)
          .values({
            ...baseRow,
            id: "sms-bad-stray-result",
            parsedResult: "{}",
            ingestionStatus: "error",
            ingestionError: "boom",
          })
          .run(),
      ).toThrow(/CHECK constraint failed/);
    });

    it("rejects status=error with ingestionError null (only that clause violated)", () => {
      expect(() =>
        ctx.db
          .insert(schema.smsLedger)
          .values({
            ...baseRow,
            id: "sms-bad-missing-error",
            parsedResult: null,
            ingestionStatus: "error",
            ingestionError: null,
          })
          .run(),
      ).toThrow(/CHECK constraint failed/);
    });
  });

  it("rejects a transaction direction outside the enum", () => {
    ctx.db
      .insert(schema.smsLedger)
      .values({
        id: "sms-2",
        sender: "VM-HDFCBK",
        body: "test",
        date: 1000,
        parserVersion: "1.0.0",
        parsedResult: "{}",
        ingestionStatus: "parsed",
        createdAt: 1000,
      })
      .run();

    expect(() =>
      ctx.sqlite
        .prepare(
          "INSERT INTO transactions (id, sms_id, amount_minor_units, currency, direction, date) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run("trx-bad", "sms-2", 10000, "INR", "sideways", 1000),
    ).toThrow(/CHECK constraint failed/);
  });

  it("enforces provider_id uniqueness independently of id", () => {
    ctx.db
      .insert(schema.smsLedger)
      .values({
        id: "sms-5",
        providerId: "shared-provider-id",
        sender: "VM-HDFCBK",
        body: "test",
        date: 1000,
        parserVersion: "1.0.0",
        parsedResult: "{}",
        ingestionStatus: "parsed",
        createdAt: 1000,
      })
      .run();

    expect(() =>
      ctx.db
        .insert(schema.smsLedger)
        .values({
          id: "sms-6", // different id, same provider id
          providerId: "shared-provider-id",
          sender: "VM-HDFCBK",
          body: "test",
          date: 2000,
          parserVersion: "1.0.0",
          parsedResult: "{}",
          ingestionStatus: "parsed",
          createdAt: 2000,
        })
        .run(),
    ).toThrow(/UNIQUE constraint failed/);
  });
});
