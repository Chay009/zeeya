// The arrival-log helpers background notifications rely on ("how many
// transactions did this sync bring in?"), against a real SQLite database fed
// through the production ingestion path — so arrivals, projection and the
// transactions join are all the real thing.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RawSms } from "../lib/sms";
import { initializeNativeDatabase } from "./native-init";
import * as schema from "./schema";
import { asyncSqlite } from "./testing/async-sqlite";

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

function freshDb() {
  const sqlite = new Database(":memory:");
  initializeNativeDatabase({ execSync: (source: string) => sqlite.exec(source) });
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    for (const statement of readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8").split(
      "--> statement-breakpoint",
    )) {
      if (statement.trim()) sqlite.exec(statement.trim());
    }
  }
  return drizzle(sqlite, { schema });
}

let testDb: ReturnType<typeof freshDb>;

vi.mock("./client", () => ({
  get db() {
    return testDb;
  },
  get sqlite() {
    return testDb ? asyncSqlite(testDb.$client) : null;
  },
}));

const { ingestSmsBatch } = await import("./ingestion");
const { countTransactionsArrivedAfter, latestArrivalSequence } = await import(
  "./caught-up-transactions"
);

const debit = (id: string, amount: string, date: number): RawSms => ({
  id,
  sender: "VM-HDFCBK",
  body: `INR ${amount} debited from account XX1234 on 09-08-2026. Avail Bal: INR 12,500.00`,
  date,
});
const otp: RawSms = {
  id: "otp",
  sender: "VM-HDFCBK",
  body: "123456 is your OTP for login. Do not share it with anyone.",
  date: 1_700_000_300_000,
};

describe("arrival log", () => {
  beforeEach(() => {
    testDb = freshDb();
  });

  it("starts empty", async () => {
    await expect(latestArrivalSequence()).resolves.toBe(0);
    await expect(countTransactionsArrivedAfter(0)).resolves.toBe(0);
  });

  it("counts only the transactions that arrived after the cursor", async () => {
    await ingestSmsBatch([debit("a", "100.00", 1_700_000_000_000)]);
    const cursor = await latestArrivalSequence();
    expect(cursor).toBeGreaterThan(0);

    // One new transaction plus a non-financial SMS: the OTP arrives too, but
    // it is not a transaction and must not be counted.
    await ingestSmsBatch([debit("b", "250.00", 1_700_000_200_000), otp]);

    await expect(countTransactionsArrivedAfter(cursor)).resolves.toBe(1);
    await expect(countTransactionsArrivedAfter(0)).resolves.toBe(2);
  });

  it("adds nothing for a re-synced SMS that was already ingested", async () => {
    const message = debit("a", "100.00", 1_700_000_000_000);
    await ingestSmsBatch([message]);
    const cursor = await latestArrivalSequence();

    await ingestSmsBatch([message]);

    await expect(latestArrivalSequence()).resolves.toBe(cursor);
    await expect(countTransactionsArrivedAfter(cursor)).resolves.toBe(0);
  });
});
