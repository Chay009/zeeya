import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { copyLegacyTables, type SQLiteValue, type SyncSqlite } from "./legacy-migration";

function adapt(sqlite: Database.Database): SyncSqlite {
  return {
    execSync: (source) => sqlite.exec(source),
    getAllSync: <T>(source: string, ...params: SQLiteValue[]) =>
      sqlite.prepare(source).all(...params) as T[],
    runSync: (source, ...params) => {
      sqlite.prepare(source).run(...params);
    },
  };
}

describe("plaintext-to-SQLCipher table copy", () => {
  it("copies parent and child rows without overwriting an existing secure row", () => {
    const legacy = new Database(":memory:");
    const secure = new Database(":memory:");
    const schema = `
      CREATE TABLE sms_ledger (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE transactions (id TEXT PRIMARY KEY, sms_id TEXT NOT NULL, amount INTEGER NOT NULL);
    `;
    legacy.exec(schema);
    secure.exec(schema);
    legacy.exec("INSERT INTO sms_ledger VALUES ('old', 'legacy');");
    legacy.exec("INSERT INTO transactions VALUES ('trx', 'old', 100);");
    secure.exec("INSERT INTO sms_ledger VALUES ('new', 'secure');");

    const result = copyLegacyTables(adapt(legacy), adapt(secure), ["sms_ledger", "transactions"]);

    expect(result).toEqual({ copiedRows: 2, sourceRows: 2 });
    expect(secure.prepare("SELECT * FROM sms_ledger ORDER BY id").all()).toEqual([
      { id: "new", body: "secure" },
      { id: "old", body: "legacy" },
    ]);
    expect(secure.prepare("SELECT * FROM transactions").all()).toEqual([
      { id: "trx", sms_id: "old", amount: 100 },
    ]);
  });

  it("skips a table absent from the legacy database", () => {
    const legacy = new Database(":memory:");
    const secure = new Database(":memory:");
    secure.exec("CREATE TABLE local_settings (id TEXT PRIMARY KEY);");

    expect(copyLegacyTables(adapt(legacy), adapt(secure), ["local_settings"])).toEqual({
      copiedRows: 0,
      sourceRows: 0,
    });
  });

  it("rolls back every copied row when a later table fails", () => {
    const legacy = new Database(":memory:");
    const secure = new Database(":memory:");
    legacy.exec(
      "CREATE TABLE sms_ledger (id TEXT PRIMARY KEY); INSERT INTO sms_ledger VALUES ('old');",
    );
    legacy.exec(
      "CREATE TABLE transactions (id TEXT PRIMARY KEY, required TEXT); INSERT INTO transactions VALUES ('trx', NULL);",
    );
    secure.exec("CREATE TABLE sms_ledger (id TEXT PRIMARY KEY);");
    secure.exec("CREATE TABLE transactions (id TEXT PRIMARY KEY, required TEXT NOT NULL);");

    expect(() =>
      copyLegacyTables(adapt(legacy), adapt(secure), ["sms_ledger", "transactions"]),
    ).toThrow();
    expect(secure.prepare("SELECT * FROM sms_ledger").all()).toEqual([]);
  });
});
