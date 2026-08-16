import { describe, it, expect } from "vitest";
import { JKBankParser } from "../banks/jk-bank.js";

const parser = new JKBankParser();

describe("JKBankParser", () => {
  // ── canHandle ──────────────────────────────────────────────────────────────

  it("handles direct sender IDs", () => {
    expect(parser.canHandle("JKBANK")).toBe(true);
    expect(parser.canHandle("JKB")).toBe(true);
    expect(parser.canHandle("JKBANKL")).toBe(true);
    expect(parser.canHandle("JKBNK")).toBe(true);
  });

  it("handles DLT-prefixed sender IDs", () => {
    expect(parser.canHandle("AD-JKBANK")).toBe(true);
    expect(parser.canHandle("AD-JKBANK-S")).toBe(true);
    expect(parser.canHandle("VM-JKB")).toBe(true);
    expect(parser.canHandle("AD-JKBNK")).toBe(true);
    expect(parser.canHandle("JKBANK-SMS")).toBe(true);
    expect(parser.canHandle("JKB-ALERTS")).toBe(true);
  });

  it("does not handle unrelated senders", () => {
    expect(parser.canHandle("SBIINB")).toBe(false);
    expect(parser.canHandle("HDFCBK")).toBe(false);
    expect(parser.canHandle("AD-AXISBK")).toBe(false);
    expect(parser.canHandle("")).toBe(false);
  });

  // ── getBankName ────────────────────────────────────────────────────────────

  it("returns correct bank name", () => {
    expect(parser.getBankName()).toBe("JK Bank");
  });

  // ── Standard debit via RTGS ────────────────────────────────────────────────

  it("parses RTGS debit transaction", () => {
    const r = parser.parse(
      "Your A/c XXXXXXXX1234 has been debited by INR 5,000.00 at 10:43 by RTGS-JAKAH25085024027.Available Bal is INR 25,000.00",
      "AD-JKBANK",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(5000);
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("RTGS Transfer");
    expect(r!.accountLast4).toBe("1234");
    expect(r!.balance).toBe(25000);
    expect(r!.currency).toBe("INR");
    expect(r!.bankName).toBe("JK Bank");
    expect(r!.transactionHash).not.toBeNull();
  });

  // ── Standard credit via UPI ────────────────────────────────────────────────

  it("parses UPI credit with sender name", () => {
    const r = parser.parse(
      "Your A/c XXXXXXXX5678 has been credited by INR 2,500.00 at 14:30 via UPI from RAHUL SHARMA on 17-Sep-24. Available Bal is INR 15,000.00. UPI Ref: 115458170728",
      "AD-JKBANK",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2500);
    expect(r!.type).toBe("INCOME");
    expect(r!.merchant).toBe("RAHUL SHARMA");
    expect(r!.accountLast4).toBe("5678");
    expect(r!.balance).toBe(15000);
    expect(r!.reference).toBe("115458170728");
    expect(r!.currency).toBe("INR");
  });

  // ── UPI debit to VPA ──────────────────────────────────────────────────────

  it("parses UPI debit to merchant VPA", () => {
    const r = parser.parse(
      "Your A/c XXXXXXXX2345 has been debited. INR 500.00 paid to swiggy@icici via UPI. UPI Ref: 987654321. Available Bal is INR 9,500.00.",
      "JKBANK",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("swiggy");
    expect(r!.accountLast4).toBe("2345");
    expect(r!.balance).toBe(9500);
    expect(r!.reference).toBe("987654321");
  });

  // ── IMPS Fund transfer credit ──────────────────────────────────────────────

  it("parses IMPS fund transfer credit with sender name", () => {
    const r = parser.parse(
      "IMPS Fund transfer Amt received from TRUEFILLINGS ADVISOR having A/C No. XXXXXX8953. Amount INR 12,000.00. RRN No. 4567890123. Available Bal is INR 50,000.00.",
      "AD-JKBANK",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(12000);
    expect(r!.type).toBe("INCOME");
    expect(r!.merchant).toBe("TRUEFILLINGS ADVISOR");
    expect(r!.reference).toBe("4567890123");
    expect(r!.balance).toBe(50000);
  });

  // ── mTFR mobile transfer debit ─────────────────────────────────────────────

  it("parses mTFR mobile transfer debit with recipient name", () => {
    const r = parser.parse(
      "Your A/c XXXXXXXX6789 has been debited by INR 1,000.00 at 16:00 by mTFR/9876543210/PRIYA SHARMA.Available Bal is INR 20,000.00.",
      "AD-JKBANK-S",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1000);
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("PRIYA SHARMA");
    expect(r!.accountLast4).toBe("6789");
    expect(r!.balance).toBe(20000);
  });

  // ── NEFT debit ─────────────────────────────────────────────────────────────

  it("parses NEFT debit transaction", () => {
    const r = parser.parse(
      "Your A/c XXXXXXXX3456 has been debited by INR 25,000.00 at 11:00 by NEFT-HDFC0009999.Available Bal is INR 75,000.00.",
      "JKB",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(25000);
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("NEFT Transfer");
    expect(r!.accountLast4).toBe("3456");
    expect(r!.balance).toBe(75000);
  });

  // ── ATM withdrawal ─────────────────────────────────────────────────────────

  it("parses ATM withdrawal", () => {
    const r = parser.parse(
      "Your A/c XXXXXXXX9999 has been debited. INR 10,000.00 withdrawn from ATM. Available Bal is INR 5,000.00.",
      "JKBNK",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(10000);
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("ATM");
    expect(r!.accountLast4).toBe("9999");
    expect(r!.balance).toBe(5000);
  });

  // ── Investment / clearing corporation ─────────────────────────────────────

  it("classifies clearing corporation debit as INVESTMENT", () => {
    const r = parser.parse(
      "Your A/c XXXXXXXX1111 has been debited by INR 15,000.00 at 11:30 by INDIAN CLEARING CORPO.Available Bal is INR 85,000.00.",
      "AD-JKBANK",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(15000);
    expect(r!.type).toBe("INVESTMENT");
    expect(r!.merchant).toBe("Indian Clearing Corporation");
    expect(r!.accountLast4).toBe("1111");
    expect(r!.balance).toBe(85000);
  });

  it("classifies NSE clearing credit as INVESTMENT", () => {
    const r = parser.parse(
      "Your A/c XXXXXXXX2222 has been credited by INR 8,000.00 at 15:00 by NSE CLEARING.Available Bal is INR 40,000.00.",
      "AD-JKBANK",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(8000);
    expect(r!.type).toBe("INVESTMENT");
    expect(r!.merchant).toBe("NSE Clearing");
    expect(r!.accountLast4).toBe("2222");
  });

  // ── Account last-4 patterns ────────────────────────────────────────────────

  it("extracts account last4 from JK Bank A/c no. pattern", () => {
    const r = parser.parse(
      "INR 3,000.00 credited to JK Bank A/c no. XXXXXXXX4321. Available Bal is INR 18,000.00.",
      "AD-JKBANK",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(3000);
    expect(r!.type).toBe("INCOME");
    expect(r!.accountLast4).toBe("4321");
  });

  it("extracts account last4 from A/c ending pattern", () => {
    const r = parser.parse(
      "INR 500.00 debited from A/c ending 7777. Available Bal is INR 2,000.00.",
      "JKBANK",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.accountLast4).toBe("7777");
  });

  // ── Balance patterns ───────────────────────────────────────────────────────

  it("extracts balance from A/C Bal is INR pattern", () => {
    const r = parser.parse(
      "Your A/c XXX8765 has been debited. INR 200.00 paid via UPI. A/C Bal is INR 3,500.00 Cr.",
      "AD-JKBANK",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.balance).toBe(3500);
  });

  // ── Reference extraction ───────────────────────────────────────────────────

  it("extracts RRN reference from IMPS credit", () => {
    const r = parser.parse(
      "Your A/c XXXXXXXX1234 has been credited by INR 7,500.00. RRN No. 9876543210. Available Bal is INR 30,000.00.",
      "JKBANKL",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.reference).toBe("9876543210");
    expect(r!.type).toBe("INCOME");
  });

  it("extracts txn Ref from transaction", () => {
    const r = parser.parse(
      "Your A/c XXXXXXXX5555 has been debited. INR 1,200.00 paid via UPI. txn Ref: TXN20240101. Available Bal is INR 10,000.00.",
      "AD-JKBANK",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.reference).toBe("TXN20240101");
  });

  // ── Tax payment ────────────────────────────────────────────────────────────

  it("parses tax payment towards TIN as Tax Information Network", () => {
    const r = parser.parse(
      "Your A/c XXXXXXXX8888 has been debited. INR 5,000.00 paid towards TIN/Tax Information Network. Available Bal is INR 25,000.00.",
      "AD-JKBANK",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(5000);
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("Tax Information Network");
  });

  // ── Transaction hash ───────────────────────────────────────────────────────

  it("generates a non-null transactionHash", () => {
    const r = parser.parse(
      "Your A/c XXXXXXXX1234 has been debited by INR 100.00 at 09:00 by RTGS-ABC123. Available Bal is INR 1,000.00.",
      "AD-JKBANK",
      1234567890,
    );
    expect(r).not.toBeNull();
    expect(r!.transactionHash).not.toBeNull();
    expect(typeof r!.transactionHash).toBe("string");
    expect(r!.transactionHash!.length).toBe(64); // SHA-256 hex
  });

  // ── Messages that should NOT parse ────────────────────────────────────────

  it("does not parse OTP message", () => {
    const r = parser.parse(
      "Your JK Bank OTP for login is 123456. Do not share with anyone.",
      "AD-JKBANK",
      0,
    );
    expect(r).toBeNull();
  });

  it("does not parse promotional message", () => {
    const r = parser.parse(
      "Special offer from JK Bank! Get amazing discount on personal loans this festive season.",
      "AD-JKBANK",
      0,
    );
    expect(r).toBeNull();
  });

  it("does not parse RTGS confirmation (not a transaction)", () => {
    const r = parser.parse(
      "Your RTGS Txn with UTR JAKAH25085024027 has been credited on 17-Sep-24 to beneficiary account.",
      "AD-JKBANK",
      0,
    );
    expect(r).toBeNull();
  });

  it("does not parse payment request message", () => {
    const r = parser.parse(
      "JOHN has requested Rs. 500 from your account. Approve or reject in JK Bank app.",
      "AD-JKBANK",
      0,
    );
    expect(r).toBeNull();
  });

  it("does not parse NEFT confirmation (not a transaction)", () => {
    const r = parser.parse(
      "Your NEFT Txn with UTR JKBAH25085024027 has been credited on 18-Sep-24.",
      "AD-JKBANK",
      0,
    );
    expect(r).toBeNull();
  });
});
