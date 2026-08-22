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
function freshInitializedDb() {
  const sqlite = new Database(":memory:");
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
        fingerprint: "fp-off",
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
        fingerprint: "fp-1",
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

  it("rejects an ingestion row whose parsedResult doesn't match its status", () => {
    expect(() =>
      ctx.db
        .insert(schema.smsLedger)
        .values({
          id: "sms-bad",
          fingerprint: "fp-bad",
          sender: "VM-HDFCBK",
          body: "test",
          date: 1000,
          parserVersion: "1.0.0",
          parsedResult: "{}", // status is "error" — parsedResult must be null
          ingestionStatus: "error",
          createdAt: 1000,
        })
        .run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it("rejects an ingestion row whose error message doesn't match its status", () => {
    expect(() =>
      ctx.db
        .insert(schema.smsLedger)
        .values({
          id: "sms-bad-2",
          fingerprint: "fp-bad-2",
          sender: "VM-HDFCBK",
          body: "test",
          date: 1000,
          parserVersion: "1.0.0",
          parsedResult: null,
          ingestionStatus: "parsed", // "parsed" must not carry an error message
          ingestionError: "boom",
          createdAt: 1000,
        })
        .run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it("rejects a transaction direction outside the enum", () => {
    ctx.db
      .insert(schema.smsLedger)
      .values({
        id: "sms-2",
        fingerprint: "fp-2",
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

  it("enforces fingerprint uniqueness independently of id", () => {
    ctx.db
      .insert(schema.smsLedger)
      .values({
        id: "sms-3",
        fingerprint: "shared-fp",
        providerId: "provider-3",
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
          id: "sms-4", // different id, same fingerprint — must still collide
          fingerprint: "shared-fp",
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

  it("enforces provider_id uniqueness independently of id and fingerprint", () => {
    ctx.db
      .insert(schema.smsLedger)
      .values({
        id: "sms-5",
        fingerprint: "fp-5",
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
          id: "sms-6", // different id and fingerprint, same provider id
          fingerprint: "fp-6",
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
