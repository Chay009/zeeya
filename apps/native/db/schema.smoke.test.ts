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

  it("ships one fresh-install migration rather than a compatibility chain", () => {
    const migrationFiles = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith(".sql"))
      .sort();
    expect(migrationFiles).toHaveLength(1);
    expect(migrationFiles[0]).toMatch(/^0000_.+\.sql$/);
  });

  // migrations.js is drizzle-kit generated output (see its own header
  // comment) — every `drizzle-kit generate` run rewrites it to import
  // whichever .sql file the run just produced. Regenerating the baseline
  // (delete + drizzle-kit generate, the recipe README.md documents) without
  // this file happening to get regenerated in the same pass — e.g.
  // restoring only schema.ts/*.sql/meta/* from a backup after a mutation
  // test, as happened here — leaves it importing a filename that no longer
  // exists on disk. Node's own migration tests (applyMigrations above)
  // never catch this: they enumerate .sql files directly by reading the
  // directory, the same way this app's real migration bundling does NOT —
  // db/provider.tsx's real Expo/React Native migration path goes through
  // this exact generated file and a static bundler import, which would
  // fail at build or run time on a stale reference no Node test exercises.
  it("migrations.js imports the exact .sql file the journal names, not a stale one", () => {
    const journal = JSON.parse(
      readFileSync(path.join(MIGRATIONS_DIR, "meta/_journal.json"), "utf-8"),
    ) as {
      entries: { tag: string }[];
    };
    expect(journal.entries).toHaveLength(1);
    const journalTag = journal.entries[0]!.tag;

    const migrationFiles = readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith(".sql"));
    expect(migrationFiles).toEqual([`${journalTag}.sql`]);

    const migrationsJs = readFileSync(path.join(MIGRATIONS_DIR, "migrations.js"), "utf-8");
    const importMatch = migrationsJs.match(/from ['"]\.\/(.+\.sql)['"]/);
    expect(importMatch).not.toBeNull();
    const importedFile = importMatch![1];

    // The two failure modes this test exists to catch: importing a
    // filename that doesn't match the journal's own tag, and importing a
    // filename that isn't actually present on disk (a real bundler import
    // of a missing file fails at build/run time — Node's require/import
    // resolution below reproduces the exact same "file not found" check a
    // real Metro bundle would hit).
    expect(importedFile).toBe(`${journalTag}.sql`);
    expect(readdirSync(MIGRATIONS_DIR)).toContain(importedFile);
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
        category: "Transaction",
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
        "budget_alerts",
        "category_budgets",
        "detected_accounts",
        "identity_conflicts",
        "local_settings",
        "mandate_events",
        "mandates",
        "message_facts",
        "projection_state",
        "sms_arrivals",
        "sms_ledger",
        "subscriptions",
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
        category: "Transaction",
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
          category: "Transaction",
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
          "INSERT INTO transactions (id, sms_id, amount_minor_units, currency, direction, category, date) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run("trx-bad", "sms-2", 10000, "INR", "sideways", "Transaction", 1000),
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

  describe("accounts anchor_status invariant", () => {
    it("rejects an anchor_status outside the enum", () => {
      expect(() =>
        ctx.sqlite
          .prepare(
            "INSERT INTO accounts (id, bank_name, bank_key, last4, currency, anchor_status, balance_minor_units, balance_as_of, balance_sender, estimated_balance_minor_units, estimated_as_of, captured_income_minor_units, captured_expense_minor_units, captured_change_minor_units, captured_transaction_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            "hdfc|1234",
            "HDFC Bank",
            "hdfc bank",
            "1234",
            "INR",
            "pending",
            0,
            1000,
            "VM-HDFCBK",
            0,
            1000,
            0,
            0,
            0,
            0,
          ),
      ).toThrow(/CHECK constraint failed/);
    });

    it("accepts both valid anchor_status values", () => {
      expect(() =>
        ctx.sqlite
          .prepare(
            "INSERT INTO accounts (id, bank_name, bank_key, last4, currency, anchor_status, balance_minor_units, balance_as_of, balance_sender, estimated_balance_minor_units, estimated_as_of, captured_income_minor_units, captured_expense_minor_units, captured_change_minor_units, captured_transaction_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            "hdfc|1234",
            "HDFC Bank",
            "hdfc bank",
            "1234",
            "INR",
            "reported",
            1000000,
            1000,
            "VM-HDFCBK",
            1000000,
            1000,
            0,
            0,
            0,
            0,
          ),
      ).not.toThrow();

      expect(() =>
        ctx.sqlite
          .prepare(
            "INSERT INTO accounts (id, bank_name, bank_key, last4, currency, anchor_status, balance_minor_units, balance_as_of, balance_sender, estimated_balance_minor_units, estimated_as_of, captured_income_minor_units, captured_expense_minor_units, captured_change_minor_units, captured_transaction_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            "icici|5678",
            "ICICI Bank",
            "icici bank",
            "5678",
            "INR",
            "unreported",
            null,
            1000,
            "VM-ICICIB",
            null,
            1000,
            0,
            0,
            0,
            0,
          ),
      ).not.toThrow();
    });
  });

  describe("accounts anchor_status/balance nullability invariant", () => {
    // A 0 in either balance column must always mean a real reported zero
    // balance, never "unreported" — this is exactly the ambiguity the
    // nullability CHECK exists to make impossible at the database level,
    // not just by convention in projections.ts's write path.
    it("rejects anchor_status=reported with a null balance", () => {
      expect(() =>
        ctx.sqlite
          .prepare(
            "INSERT INTO accounts (id, bank_name, bank_key, last4, currency, anchor_status, balance_minor_units, balance_as_of, balance_sender, estimated_balance_minor_units, estimated_as_of, captured_income_minor_units, captured_expense_minor_units, captured_change_minor_units, captured_transaction_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            "hdfc|1234",
            "HDFC Bank",
            "hdfc bank",
            "1234",
            "INR",
            "reported",
            null,
            1000,
            "VM-HDFCBK",
            5000,
            1000,
            0,
            0,
            0,
            0,
          ),
      ).toThrow(/CHECK constraint failed/);
    });

    it("rejects anchor_status=unreported with a real (non-null) balance", () => {
      expect(() =>
        ctx.sqlite
          .prepare(
            "INSERT INTO accounts (id, bank_name, bank_key, last4, currency, anchor_status, balance_minor_units, balance_as_of, balance_sender, estimated_balance_minor_units, estimated_as_of, captured_income_minor_units, captured_expense_minor_units, captured_change_minor_units, captured_transaction_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            "hdfc|1234",
            "HDFC Bank",
            "hdfc bank",
            "1234",
            "INR",
            "unreported",
            0,
            1000,
            "VM-HDFCBK",
            null,
            1000,
            0,
            0,
            0,
            0,
          ),
      ).toThrow(/CHECK constraint failed/);
    });
  });

  describe("accounts captured_transaction_count invariant", () => {
    it("rejects a negative captured_transaction_count", () => {
      expect(() =>
        ctx.sqlite
          .prepare(
            "INSERT INTO accounts (id, bank_name, bank_key, last4, currency, anchor_status, balance_minor_units, balance_as_of, balance_sender, estimated_balance_minor_units, estimated_as_of, captured_income_minor_units, captured_expense_minor_units, captured_change_minor_units, captured_transaction_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            "hdfc|1234",
            "HDFC Bank",
            "hdfc bank",
            "1234",
            "INR",
            "reported",
            100000,
            1000,
            "VM-HDFCBK",
            100000,
            1000,
            0,
            0,
            0,
            -1,
          ),
      ).toThrow(/CHECK constraint failed/);
    });

    it("accepts zero and a positive captured_transaction_count", () => {
      expect(() =>
        ctx.sqlite
          .prepare(
            "INSERT INTO accounts (id, bank_name, bank_key, last4, currency, anchor_status, balance_minor_units, balance_as_of, balance_sender, estimated_balance_minor_units, estimated_as_of, captured_income_minor_units, captured_expense_minor_units, captured_change_minor_units, captured_transaction_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            "hdfc|1234",
            "HDFC Bank",
            "hdfc bank",
            "1234",
            "INR",
            "reported",
            100000,
            1000,
            "VM-HDFCBK",
            100000,
            1000,
            0,
            0,
            0,
            0,
          ),
      ).not.toThrow();

      expect(() =>
        ctx.sqlite
          .prepare(
            "INSERT INTO accounts (id, bank_name, bank_key, last4, currency, anchor_status, balance_minor_units, balance_as_of, balance_sender, estimated_balance_minor_units, estimated_as_of, captured_income_minor_units, captured_expense_minor_units, captured_change_minor_units, captured_transaction_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            "icici|5678",
            "ICICI Bank",
            "icici bank",
            "5678",
            "INR",
            "reported",
            50000,
            1000,
            "VM-ICICIB",
            50000,
            1000,
            10000,
            0,
            10000,
            3,
          ),
      ).not.toThrow();
    });
  });

  describe("accounts captured income/expense/change invariants", () => {
    // Shared insert helper — only the four captured-* values vary between
    // cases below; everything else is fixed, valid boilerplate.
    let nextAccountId = 0;
    function insertAccountCaptured(
      capturedIncome: number,
      capturedExpense: number,
      capturedChange: number,
      capturedTransactionCount: number,
    ) {
      nextAccountId++;
      return ctx.sqlite
        .prepare(
          "INSERT INTO accounts (id, bank_name, bank_key, last4, currency, anchor_status, balance_minor_units, balance_as_of, balance_sender, estimated_balance_minor_units, estimated_as_of, captured_income_minor_units, captured_expense_minor_units, captured_change_minor_units, captured_transaction_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          `hdfc|${nextAccountId}`,
          "HDFC Bank",
          "hdfc bank",
          `${nextAccountId}`,
          "INR",
          "reported",
          100000,
          1000,
          "VM-HDFCBK",
          100000,
          1000,
          capturedIncome,
          capturedExpense,
          capturedChange,
          capturedTransactionCount,
        );
    }

    it("rejects a negative captured_income_minor_units", () => {
      expect(() => insertAccountCaptured(-100, 0, -100, 1)).toThrow(/CHECK constraint failed/);
    });

    it("rejects a negative captured_expense_minor_units", () => {
      expect(() => insertAccountCaptured(0, -100, 100, 1)).toThrow(/CHECK constraint failed/);
    });

    it("rejects captured_change that doesn't equal income minus expense", () => {
      expect(() => insertAccountCaptured(500, 200, 999, 2)).toThrow(/CHECK constraint failed/);
    });

    it("accepts captured_change that correctly equals income minus expense, including a negative result", () => {
      expect(() => insertAccountCaptured(500, 200, 300, 2)).not.toThrow();
      expect(() => insertAccountCaptured(200, 500, -300, 2)).not.toThrow();
    });

    it("rejects a zero captured_transaction_count with a non-zero captured amount", () => {
      expect(() => insertAccountCaptured(500, 0, 500, 0)).toThrow(/CHECK constraint failed/);
      expect(() => insertAccountCaptured(0, 500, -500, 0)).toThrow(/CHECK constraint failed/);
      expect(() => insertAccountCaptured(0, 0, 100, 0)).toThrow(/CHECK constraint failed/);
    });

    it("accepts a zero captured_transaction_count only when every captured amount is also zero", () => {
      expect(() => insertAccountCaptured(0, 0, 0, 0)).not.toThrow();
    });
  });

  describe("balance_readings association_kind/account_id invariant", () => {
    // A reading is only ever written with a non-null account_id when
    // db/projections.ts calls projectBalanceReading for a reading inside a
    // confirmed AccountBalance.history — association kind 'confirmed'.
    // Every 'suggested'/'unassigned' reading is always written with
    // accountId null, even once 'suggested' picks a sole-candidate account
    // for display — the suggestion is presentation-only and never becomes
    // a real foreign key. This CHECK makes the contradictory combinations
    // (confirmed+null, unassigned+non-null) impossible at the database
    // level, not just by projections.ts's own convention.
    function seedLedgerRow(id: string) {
      ctx.db
        .insert(schema.smsLedger)
        .values({
          id,
          sender: "VM-HDFCBK",
          body: "test",
          date: 1000,
          parserVersion: "1.0.0",
          parsedResult: "{}",
          ingestionStatus: "parsed",
          createdAt: 1000,
        })
        .run();
    }

    function seedAccount(id: string) {
      ctx.sqlite
        .prepare(
          "INSERT INTO accounts (id, bank_name, bank_key, last4, currency, anchor_status, balance_minor_units, balance_as_of, balance_sender, estimated_balance_minor_units, estimated_as_of, captured_income_minor_units, captured_expense_minor_units, captured_change_minor_units, captured_transaction_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          id,
          "HDFC Bank",
          "hdfc bank",
          "1234",
          "INR",
          "reported",
          100000,
          1000,
          "VM-HDFCBK",
          100000,
          1000,
          0,
          0,
          0,
          0,
        );
    }

    it("rejects association_kind=confirmed with a null account_id", () => {
      seedLedgerRow("sms-br-1");
      expect(() =>
        ctx.sqlite
          .prepare(
            "INSERT INTO balance_readings (id, sms_id, account_id, balance_minor_units, currency, as_of, detected_bank_name, detected_bank_key, association_kind, sender) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            "sms-br-1",
            "sms-br-1",
            null,
            100000,
            "INR",
            1000,
            "HDFC Bank",
            "hdfc bank",
            "confirmed",
            "VM-HDFCBK",
          ),
      ).toThrow(/CHECK constraint failed/);
    });

    it("rejects association_kind=unassigned with a non-null account_id", () => {
      seedLedgerRow("sms-br-2");
      seedAccount("hdfc|1234");
      expect(() =>
        ctx.sqlite
          .prepare(
            "INSERT INTO balance_readings (id, sms_id, account_id, balance_minor_units, currency, as_of, detected_bank_name, detected_bank_key, association_kind, sender) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            "sms-br-2",
            "sms-br-2",
            "hdfc|1234",
            100000,
            "INR",
            1000,
            "HDFC Bank",
            "hdfc bank",
            "unassigned",
            "VM-HDFCBK",
          ),
      ).toThrow(/CHECK constraint failed/);
    });

    it("accepts confirmed with a non-null account_id, and unassigned/suggested with a null one", () => {
      seedLedgerRow("sms-br-3");
      seedAccount("hdfc|1234");
      expect(() =>
        ctx.sqlite
          .prepare(
            "INSERT INTO balance_readings (id, sms_id, account_id, balance_minor_units, currency, as_of, detected_bank_name, detected_bank_key, association_kind, sender) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            "sms-br-3",
            "sms-br-3",
            "hdfc|1234",
            100000,
            "INR",
            1000,
            "HDFC Bank",
            "hdfc bank",
            "confirmed",
            "VM-HDFCBK",
          ),
      ).not.toThrow();

      seedLedgerRow("sms-br-4");
      expect(() =>
        ctx.sqlite
          .prepare(
            "INSERT INTO balance_readings (id, sms_id, account_id, balance_minor_units, currency, as_of, detected_bank_name, detected_bank_key, association_kind, sender) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            "sms-br-4",
            "sms-br-4",
            null,
            100000,
            "INR",
            1000,
            "HDFC Bank",
            "hdfc bank",
            "unassigned",
            "VM-HDFCBK",
          ),
      ).not.toThrow();

      seedLedgerRow("sms-br-5");
      expect(() =>
        ctx.sqlite
          .prepare(
            "INSERT INTO balance_readings (id, sms_id, account_id, balance_minor_units, currency, as_of, detected_bank_name, detected_bank_key, association_kind, sender) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            "sms-br-5",
            "sms-br-5",
            null,
            100000,
            "INR",
            1000,
            "HDFC Bank",
            "hdfc bank",
            "suggested",
            "VM-HDFCBK",
          ),
      ).not.toThrow();
    });
  });

  describe("activity category/mandate_event/direction invariants", () => {
    function seedLedgerRow(id: string) {
      ctx.db
        .insert(schema.smsLedger)
        .values({
          id,
          sender: "VM-HDFCBK",
          body: "test",
          date: 1000,
          parserVersion: "1.0.0",
          parsedResult: "{}",
          ingestionStatus: "parsed",
          createdAt: 1000,
        })
        .run();
    }

    it("rejects a category outside the ten product categories projectActivityRows ever writes", () => {
      seedLedgerRow("sms-act-1");
      expect(() =>
        ctx.sqlite
          .prepare(
            "INSERT INTO activity (id, sms_id, category, date, is_from_card, sender) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .run("sms-act-1|GRM_VOID", "sms-act-1", "GRM_VOID", 1000, 0, "VM-HDFCBK"),
      ).toThrow(/CHECK constraint failed/);
    });

    it("accepts every one of the ten valid categories", () => {
      const categories = [
        "GRM_BANK",
        "GRM_BILL",
        "GRM_STOCKUPDATES",
        "GRM_TRAVEL",
        "GRM_DELIVERY",
        "GRM_EVENT",
        "GRM_APPOINTMENT",
        "GRM_NOTIF",
        "GRM_OTP",
        "GRM_OFFERS",
      ];
      categories.forEach((category, index) => {
        const smsId = `sms-act-cat-${index}`;
        seedLedgerRow(smsId);
        expect(() =>
          ctx.sqlite
            .prepare(
              "INSERT INTO activity (id, sms_id, category, date, is_from_card, sender) VALUES (?, ?, ?, ?, ?, ?)",
            )
            .run(`${smsId}|${category}`, smsId, category, 1000, 0, "VM-HDFCBK"),
        ).not.toThrow();
      });
    });

    it("rejects a mandate_event outside active/cancelled", () => {
      seedLedgerRow("sms-act-2");
      expect(() =>
        ctx.sqlite
          .prepare(
            "INSERT INTO activity (id, sms_id, category, date, mandate_event, is_from_card, sender) VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
          .run("sms-act-2|GRM_BANK", "sms-act-2", "GRM_BANK", 1000, "pending", 0, "VM-HDFCBK"),
      ).toThrow(/CHECK constraint failed/);
    });

    it("rejects a direction outside income/expense/neutral", () => {
      seedLedgerRow("sms-act-3");
      expect(() =>
        ctx.sqlite
          .prepare(
            "INSERT INTO activity (id, sms_id, category, date, direction, is_from_card, sender) VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
          .run("sms-act-3|GRM_BANK", "sms-act-3", "GRM_BANK", 1000, "sideways", 0, "VM-HDFCBK"),
      ).toThrow(/CHECK constraint failed/);
    });

    it("accepts a non-financial activity row with null amount/currency/direction", () => {
      seedLedgerRow("sms-act-4");
      expect(() =>
        ctx.sqlite
          .prepare(
            "INSERT INTO activity (id, sms_id, category, date, is_from_card, sender) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .run("sms-act-4|GRM_TRAVEL", "sms-act-4", "GRM_TRAVEL", 1000, 0, "VM-HDFCBK"),
      ).not.toThrow();
    });

    // A financial activity row (one whose message also produced a
    // transactions row) always carries all three of
    // amount_minor_units/currency/direction together, never a partial
    // combination — see projectActivityRows's financialRow parameter.
    it("rejects an amount with null currency and direction (partial financial data)", () => {
      seedLedgerRow("sms-act-5");
      expect(() =>
        ctx.sqlite
          .prepare(
            "INSERT INTO activity (id, sms_id, category, date, amount_minor_units, is_from_card, sender) VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
          .run("sms-act-5|GRM_BANK", "sms-act-5", "GRM_BANK", 1000, 50000, 0, "VM-HDFCBK"),
      ).toThrow(/CHECK constraint failed/);
    });

    it("accepts amount, currency, and direction together (complete financial data)", () => {
      seedLedgerRow("sms-act-6");
      expect(() =>
        ctx.sqlite
          .prepare(
            "INSERT INTO activity (id, sms_id, category, date, amount_minor_units, currency, direction, is_from_card, sender) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            "sms-act-6|GRM_BANK",
            "sms-act-6",
            "GRM_BANK",
            1000,
            50000,
            "INR",
            "expense",
            0,
            "VM-HDFCBK",
          ),
      ).not.toThrow();
    });
  });

  describe("subscriptions confidence/count invariant", () => {
    // Mirrors lib/subscriptions.ts's own rule exactly: a qualifying run
    // shorter than 2 occurrences is never turned into a Subscription at
    // all, so "possible" can only ever mean exactly 2 occurrences and
    // "likely" only ever 3+ — see the CHECK constraint's own comment in
    // db/schema.ts.
    it("rejects confidence=possible with a count other than 2", () => {
      expect(() =>
        ctx.sqlite
          .prepare(
            "INSERT INTO subscriptions (id, merchant, amount_minor_units, currency, count, last_date, confidence) VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
          .run("netflix|inr", "Netflix", 64900, "INR", 3, 1000, "possible"),
      ).toThrow(/CHECK constraint failed/);
    });

    it("rejects confidence=likely with a count below 3", () => {
      expect(() =>
        ctx.sqlite
          .prepare(
            "INSERT INTO subscriptions (id, merchant, amount_minor_units, currency, count, last_date, confidence) VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
          .run("spotify|inr", "Spotify", 11900, "INR", 2, 1000, "likely"),
      ).toThrow(/CHECK constraint failed/);
    });

    it("accepts the two valid combinations", () => {
      expect(() =>
        ctx.sqlite
          .prepare(
            "INSERT INTO subscriptions (id, merchant, amount_minor_units, currency, count, last_date, confidence) VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
          .run("gym|inr", "Cult Fit", 120000, "INR", 2, 1000, "possible"),
      ).not.toThrow();

      expect(() =>
        ctx.sqlite
          .prepare(
            "INSERT INTO subscriptions (id, merchant, amount_minor_units, currency, count, last_date, confidence) VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
          .run("netflix|inr", "Netflix", 64900, "INR", 24, 1000, "likely"),
      ).not.toThrow();
    });
  });
});
