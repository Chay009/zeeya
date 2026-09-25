import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { repairLegacyNativeSchema } from "./native-schema-compat";

function adapter(sqlite: Database.Database) {
  return {
    execSync: (source: string) => sqlite.exec(source),
    getFirstSync: (source: string) => {
      const row = sqlite.prepare(source).get();
      if (
        typeof row === "object" &&
        row !== null &&
        "value" in row &&
        typeof row.value === "number"
      ) {
        return { value: row.value };
      }
      return null;
    },
  };
}

describe("native schema compatibility", () => {
  it("adds the daily-budget column to an already-migrated local_settings table", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE local_settings (
        id text PRIMARY KEY NOT NULL,
        background_sync_enabled integer DEFAULT false NOT NULL,
        transaction_notifications_enabled integer DEFAULT false NOT NULL,
        biometric_lock_enabled integer DEFAULT false NOT NULL,
        screen_capture_protection_enabled integer DEFAULT false NOT NULL,
        last_seen_arrival_sequence integer DEFAULT 0 NOT NULL,
        updated_at integer NOT NULL
      );
      INSERT INTO local_settings (
        id,
        background_sync_enabled,
        transaction_notifications_enabled,
        biometric_lock_enabled,
        screen_capture_protection_enabled,
        last_seen_arrival_sequence,
        updated_at
      ) VALUES ('default', 1, 0, 0, 0, 7, 1234);
    `);

    repairLegacyNativeSchema(adapter(sqlite));
    repairLegacyNativeSchema(adapter(sqlite));

    const columns = sqlite.prepare("PRAGMA table_info(local_settings)").all();
    expect(columns).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "daily_budget_minor_units" })]),
    );
    expect(sqlite.prepare("SELECT * FROM local_settings WHERE id = 'default'").get()).toMatchObject(
      {
        background_sync_enabled: 1,
        last_seen_arrival_sequence: 7,
        daily_budget_minor_units: null,
      },
    );
  });

  it("is a no-op before a fresh database creates local_settings", () => {
    const sqlite = new Database(":memory:");
    expect(() => repairLegacyNativeSchema(adapter(sqlite))).not.toThrow();
  });

  it("adds activity.account_id and its composite index to an already-migrated activity table", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE accounts (
        id text PRIMARY KEY NOT NULL,
        bank_name text NOT NULL,
        bank_key text NOT NULL,
        last4 text NOT NULL,
        currency text NOT NULL,
        anchor_status text NOT NULL,
        balance_minor_units integer,
        balance_as_of integer NOT NULL,
        balance_sender text NOT NULL,
        estimated_balance_minor_units integer,
        estimated_as_of integer NOT NULL,
        reconciliation_delta_minor_units integer,
        captured_income_minor_units integer NOT NULL,
        captured_expense_minor_units integer NOT NULL,
        captured_change_minor_units integer NOT NULL,
        captured_transaction_count integer NOT NULL
      );
      CREATE TABLE sms_ledger (
        id text PRIMARY KEY NOT NULL,
        sender text NOT NULL,
        body text NOT NULL,
        date integer NOT NULL,
        parser_version text NOT NULL,
        parsed_result text NOT NULL,
        ingestion_status text NOT NULL,
        created_at integer NOT NULL
      );
      CREATE TABLE activity (
        id text PRIMARY KEY NOT NULL,
        sms_id text NOT NULL,
        category text NOT NULL,
        date integer NOT NULL,
        sender text NOT NULL,
        is_from_card integer DEFAULT 0 NOT NULL,
        FOREIGN KEY (sms_id) REFERENCES sms_ledger(id) ON DELETE CASCADE
      );
    `);

    repairLegacyNativeSchema(adapter(sqlite));
    repairLegacyNativeSchema(adapter(sqlite));

    const columns = sqlite.prepare("PRAGMA table_info(activity)").all();
    expect(columns).toEqual(expect.arrayContaining([expect.objectContaining({ name: "account_id" })]));
    const indexes = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'activity'")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(indexes).toContain("activity_account_id_date_id_idx");
  });
});
