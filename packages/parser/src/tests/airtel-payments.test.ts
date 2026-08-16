import { describe, it, expect } from "vitest";
import { AirtelPaymentsBankParser } from "../banks/airtel-payments.js";

const parser = new AirtelPaymentsBankParser();

describe("AirtelPaymentsBankParser", () => {
  // ── getBankName ───────────────────────────────────────────────────────────

  it("returns correct bank name", () => {
    expect(parser.getBankName()).toBe("Airtel Payments Bank");
  });

  // ── canHandle ─────────────────────────────────────────────────────────────

  it("handles sender containing AIRBNK", () => {
    expect(parser.canHandle("AD-AIRBNK-S")).toBe(true);
    expect(parser.canHandle("XX-AIRBNK-T")).toBe(true);
    expect(parser.canHandle("AIRBNK")).toBe(true);
    expect(parser.canHandle("airbnk")).toBe(true);
  });

  it("rejects unrelated senders", () => {
    expect(parser.canHandle("HDFCBK")).toBe(false);
    expect(parser.canHandle("SBIBNK")).toBe(false);
    expect(parser.canHandle("ICICIB")).toBe(false);
    expect(parser.canHandle("AD-AIRTEL-S")).toBe(false);
    expect(parser.canHandle("")).toBe(false);
  });

  // ── credit transactions ───────────────────────────────────────────────────

  it("parses credit transaction with Txn ID", () => {
    const msg =
      "Airtel Payments Bank a/c is credited with Rs.20.00. Txn ID: 560992310006. Call 180023400 for help";
    const r = parser.parse(msg, "AD-AIRBNK-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(20.0);
    expect(r!.type).toBe("INCOME");
    expect(r!.reference).toBe("560992310006");
    expect(r!.bankName).toBe("Airtel Payments Bank");
    expect(r!.currency).toBe("INR");
  });

  it("parses credit transaction with comma-separated amount", () => {
    const msg =
      "Airtel Payments Bank a/c is credited with Rs.1,500.00. Txn ID: 123456789012. Call 180023400 for help";
    const r = parser.parse(msg, "AD-AIRBNK-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1500.0);
    expect(r!.type).toBe("INCOME");
    expect(r!.reference).toBe("123456789012");
  });

  // ── debit transactions ────────────────────────────────────────────────────

  it("parses debit transaction with balance", () => {
    const msg =
      "Rs. 5.00 debited from Airtel Payments Bank a/c Txn ID xxxxxxxx Bal:15.56 Call 180023400 for help";
    const r = parser.parse(msg, "AD-AIRBNK-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(5.0);
    expect(r!.type).toBe("EXPENSE");
    expect(r!.balance).toBe(15.56);
    expect(r!.reference).toBeNull(); // masked Txn ID "xxxxxxxx" is filtered out
    expect(r!.bankName).toBe("Airtel Payments Bank");
  });

  it("parses debit transaction with comma-separated amount and balance", () => {
    const msg =
      "Rs. 2,000.00 debited from Airtel Payments Bank a/c Txn ID 987654321000 Bal:8,500.00 Call 180023400 for help";
    const r = parser.parse(msg, "AIRBNK", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2000.0);
    expect(r!.type).toBe("EXPENSE");
    expect(r!.balance).toBe(8500.0);
    expect(r!.reference).toBe("987654321000");
  });

  it("parses debited with variant", () => {
    const msg =
      "Your Airtel Payments Bank a/c debited with Rs.500.00. Txn ID: 111222333444. Bal:5000.00";
    const r = parser.parse(msg, "AD-AIRBNK-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500.0);
    expect(r!.type).toBe("EXPENSE");
    expect(r!.balance).toBe(5000.0);
    expect(r!.reference).toBe("111222333444");
  });

  // ── balance extraction ────────────────────────────────────────────────────

  it('extracts balance from "Bal:" pattern', () => {
    const msg =
      "Rs. 5.00 debited from Airtel Payments Bank a/c Txn ID xxxxxxxx Bal:15.56 Call 180023400 for help";
    const r = parser.parse(msg, "AD-AIRBNK-S", 0);
    expect(r).not.toBeNull();
    expect(r!.balance).toBe(15.56);
  });

  it('extracts balance from "Balance: Rs." pattern', () => {
    const msg =
      "Airtel Payments Bank a/c is credited with Rs.100.00. Txn ID: 555666777888. Balance: Rs. 2500.00";
    const r = parser.parse(msg, "AD-AIRBNK-S", 0);
    expect(r).not.toBeNull();
    expect(r!.balance).toBe(2500.0);
  });

  // ── reference extraction ──────────────────────────────────────────────────

  it("extracts Txn ID with colon separator", () => {
    const msg =
      "Airtel Payments Bank a/c is credited with Rs.20.00. Txn ID: 560992310006. Call 180023400 for help";
    const r = parser.parse(msg, "AD-AIRBNK-S", 0);
    expect(r).not.toBeNull();
    expect(r!.reference).toBe("560992310006");
  });

  it("filters out masked Txn IDs containing x", () => {
    const msg = "Rs. 5.00 debited from Airtel Payments Bank a/c Txn ID xxxxxxxx Bal:15.56";
    const r = parser.parse(msg, "AD-AIRBNK-S", 0);
    expect(r).not.toBeNull();
    expect(r!.reference).toBeNull();
  });

  it("extracts Transaction ID alternative pattern", () => {
    const msg =
      "Airtel Payments Bank a/c debited with Rs.300.00. Transaction ID: TXN123456789. Bal:700.00";
    const r = parser.parse(msg, "AD-AIRBNK-S", 0);
    expect(r).not.toBeNull();
    expect(r!.reference).toBe("TXN123456789");
  });

  // ── merchant extraction ───────────────────────────────────────────────────

  it('returns "Airtel Payments Bank Transaction" when message contains "airtel payments bank"', () => {
    const msg = "Airtel Payments Bank a/c is credited with Rs.20.00. Txn ID: 560992310006.";
    const r = parser.parse(msg, "AD-AIRBNK-S", 0);
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe("Airtel Payments Bank Transaction");
  });

  // ── transaction type from type keywords ───────────────────────────────────

  it('detects INCOME from "is credited" keyword', () => {
    const msg = "Airtel Payments Bank a/c is credited with Rs.50.00. Txn ID: 100200300400.";
    const r = parser.parse(msg, "AD-AIRBNK-S", 0);
    expect(r).not.toBeNull();
    expect(r!.type).toBe("INCOME");
  });

  it('detects EXPENSE from "debited from" keyword', () => {
    const msg = "Rs. 75.00 debited from Airtel Payments Bank a/c Txn ID 200300400500 Bal:425.00";
    const r = parser.parse(msg, "AD-AIRBNK-S", 0);
    expect(r).not.toBeNull();
    expect(r!.type).toBe("EXPENSE");
  });

  // ── non-transaction messages ──────────────────────────────────────────────

  it("does not parse OTP messages", () => {
    const msg = "Your Airtel Payments Bank OTP is 123456. Valid for 10 minutes. Do not share.";
    expect(parser.parse(msg, "AD-AIRBNK-S", 0)).toBeNull();
  });

  it("does not parse verification messages", () => {
    const msg = "Your Airtel Payments Bank account verification code is 789012.";
    expect(parser.parse(msg, "AD-AIRBNK-S", 0)).toBeNull();
  });

  it("does not parse payment request messages", () => {
    const msg = "user@upi has requested Rs. 100.00 from your Airtel Payments Bank account.";
    expect(parser.parse(msg, "AD-AIRBNK-S", 0)).toBeNull();
  });

  it("does not parse failed transaction messages", () => {
    const msg = "Your Airtel Payments Bank transaction of Rs. 200.00 failed. Please retry.";
    expect(parser.parse(msg, "AD-AIRBNK-S", 0)).toBeNull();
  });
});
