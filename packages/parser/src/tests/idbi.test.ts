import { describe, it, expect } from "vitest";
import { IDBIBankParser } from "../banks/idbi.js";

const parser = new IDBIBankParser();

describe("IDBIBankParser", () => {
  // ── getBankName ───────────────────────────────────────────────────────────

  it("returns correct bank name", () => {
    expect(parser.getBankName()).toBe("IDBI Bank");
  });

  // ── canHandle ─────────────────────────────────────────────────────────────

  it("handles known senders", () => {
    // Direct string matches
    expect(parser.canHandle("IDBIBK")).toBe(true);
    expect(parser.canHandle("IDBIBANK")).toBe(true);
    // Contains-based matches
    expect(parser.canHandle("IDBIBK-TXN")).toBe(true);
    expect(parser.canHandle("AD-IDBIBANK")).toBe(true);
    // Generic IDBI contains match
    expect(parser.canHandle("IDBI")).toBe(true);
    // DLT patterns with -S suffix
    expect(parser.canHandle("CP-IDBIBK-S")).toBe(true);
    expect(parser.canHandle("IN-IDBI-S")).toBe(true);
    // Legacy DLT patterns without suffix
    expect(parser.canHandle("CP-IDBIBK")).toBe(true);
    expect(parser.canHandle("IN-IDBI")).toBe(true);
  });

  it("rejects non-IDBI senders", () => {
    expect(parser.canHandle("HDFCBK")).toBe(false);
    expect(parser.canHandle("SBIBNK")).toBe(false);
    expect(parser.canHandle("ICICIBK")).toBe(false);
    expect(parser.canHandle("")).toBe(false);
  });

  // ── debit: "debited with Rs X" ────────────────────────────────────────────

  it('parses debit "debited with Rs" pattern', () => {
    const msg =
      "Your account has been successfully debited with Rs 59.00 towards AMAZON for purchase. Bal Rs 3694.38. To block UPI send SMS.";
    const r = parser.parse(msg, "CP-IDBIBK-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(59);
    expect(r!.type).toBe("EXPENSE");
    expect(r!.balance).toBe(3694.38);
    expect(r!.bankName).toBe("IDBI Bank");
    expect(r!.currency).toBe("INR");
  });

  it('parses debit "debited with Rs" with comma-separated amount', () => {
    const msg = "Your account has been debited with Rs 1,500.00. Bal Rs 12,000.00";
    const r = parser.parse(msg, "IDBIBK", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1500);
    expect(r!.type).toBe("EXPENSE");
    expect(r!.balance).toBe(12000);
  });

  // ── debit: "debited for Rs X" (UPI) ──────────────────────────────────────

  it('parses UPI debit "debited for Rs" pattern with account and RRN', () => {
    const msg = "IDBI Bank Acct XX1234 debited for Rs 1040.00. RRN 519766155631. Bal Rs 5000.00";
    const r = parser.parse(msg, "CP-IDBIBK-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1040);
    expect(r!.type).toBe("EXPENSE");
    expect(r!.accountLast4).toBe("1234");
    expect(r!.reference).toBe("519766155631");
    expect(r!.balance).toBe(5000);
  });

  it('parses debit "debited for Rs" with UPI reference', () => {
    const msg = "IDBI Bank Acct XX5678 debited for Rs 250.00. UPI:521687538121. Bal Rs 8750.00";
    const r = parser.parse(msg, "IDBIBK", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(250);
    expect(r!.type).toBe("EXPENSE");
    expect(r!.accountLast4).toBe("5678");
    expect(r!.reference).toBe("521687538121");
    expect(r!.balance).toBe(8750);
  });

  // ── credit: "credited with Rs X" ─────────────────────────────────────────

  it('parses credit "credited with Rs" pattern', () => {
    const msg = "Your IDBI Bank account has been credited with Rs 5000.00. Bal Rs 15000.00";
    const r = parser.parse(msg, "CP-IDBIBK-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(5000);
    expect(r!.type).toBe("INCOME");
    expect(r!.balance).toBe(15000);
  });

  it("parses credit with account last4 and RRN", () => {
    const msg =
      "IDBI Bank Acct XX9012 credited with Rs 2,300.50. RRN 123456789012. Bal Rs 22300.50";
    const r = parser.parse(msg, "IDBIBANK", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2300.5);
    expect(r!.type).toBe("INCOME");
    expect(r!.accountLast4).toBe("9012");
    expect(r!.reference).toBe("123456789012");
    expect(r!.balance).toBe(22300.5);
  });

  // ── merchant extraction ───────────────────────────────────────────────────

  it('extracts merchant from "towards <merchant> for" pattern', () => {
    const msg =
      "Your account has been debited with Rs 499.00 towards SWIGGY for food order. Bal Rs 6200.00";
    const r = parser.parse(msg, "CP-IDBIBK-S", 0);
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe("SWIGGY");
  });

  it('extracts merchant from "; <merchant> credited." pattern', () => {
    const msg = "IDBI Bank Acct XX3456 credited with Rs 10000.00; SALARY credited. Bal Rs 50000.00";
    const r = parser.parse(msg, "IDBIBK", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(10000);
    expect(r!.merchant).toBe("SALARY");
  });

  it('extracts merchant from AutoPay/Mandate "towards X for YMANDATEDATE" pattern', () => {
    const msg =
      "IDBI Bank Acct XX7890 debited with Rs 999.00 towards NETFLIX for MANDATE AutoPay. Bal Rs 4001.00";
    const r = parser.parse(msg, "CP-IDBIBK-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(999);
    // merchant extracted from "towards NETFLIX for"
    expect(r!.merchant).toBe("NETFLIX");
  });

  // ── account last4 patterns ────────────────────────────────────────────────

  it('extracts account last4 from "Acct XX1234" pattern', () => {
    const msg = "IDBI Bank Acct XX1111 debited for Rs 100.00. Bal Rs 900.00";
    const r = parser.parse(msg, "IDBIBK", 0);
    expect(r).not.toBeNull();
    expect(r!.accountLast4).toBe("1111");
  });

  it('extracts account last4 from "IDBI Bank Acct XX1234" pattern', () => {
    const msg = "IDBI Bank Acct XX2222 credited with Rs 500.00. Bal Rs 5500.00";
    const r = parser.parse(msg, "CP-IDBI-S", 0);
    expect(r).not.toBeNull();
    expect(r!.accountLast4).toBe("2222");
  });

  // ── reference patterns ────────────────────────────────────────────────────

  it("extracts RRN reference", () => {
    const msg = "IDBI Bank Acct XX3333 debited for Rs 750.00. RRN 987654321098. Bal Rs 3250.00";
    const r = parser.parse(msg, "IDBIBK", 0);
    expect(r).not.toBeNull();
    expect(r!.reference).toBe("987654321098");
  });

  it("extracts UPI reference", () => {
    const msg = "IDBI Bank Acct XX4444 debited for Rs 120.00. UPI:112233445566. Bal Rs 1880.00";
    const r = parser.parse(msg, "IDBIBK", 0);
    expect(r).not.toBeNull();
    expect(r!.reference).toBe("112233445566");
  });

  // ── balance patterns ──────────────────────────────────────────────────────

  it('extracts balance from "Bal Rs" pattern', () => {
    const msg = "IDBI Bank Acct XX5555 debited for Rs 200.00. Bal Rs 3694.38";
    const r = parser.parse(msg, "CP-IDBIBK-S", 0);
    expect(r).not.toBeNull();
    expect(r!.balance).toBe(3694.38);
  });

  it('extracts balance from "Bal Rs" with comma-separated amount', () => {
    const msg = "Your account debited with Rs 100.00. Bal Rs 1,23,456.78";
    const r = parser.parse(msg, "IDBIBK", 0);
    expect(r).not.toBeNull();
    expect(r!.balance).toBe(123456.78);
  });

  // ── non-transaction messages ──────────────────────────────────────────────

  it("does not parse OTP messages", () => {
    const msg = "Your IDBI Bank OTP is 987654. Valid for 10 minutes. Do not share with anyone.";
    expect(parser.parse(msg, "IDBIBK", 0)).toBeNull();
  });

  it("does not parse promotional/offer messages", () => {
    const msg =
      "Exciting offer on your IDBI Bank account! Get cashback offer on shopping. T&C apply.";
    expect(parser.parse(msg, "IDBIBK", 0)).toBeNull();
  });

  it("does not parse messages without an amount", () => {
    const msg =
      "Your IDBI Bank account has been debited. Please contact customer care for details.";
    expect(parser.parse(msg, "CP-IDBIBK-S", 0)).toBeNull();
  });

  // ── miscellaneous ─────────────────────────────────────────────────────────

  it("returns correct currency INR", () => {
    const msg = "IDBI Bank Acct XX6666 debited for Rs 50.00. Bal Rs 950.00";
    const r = parser.parse(msg, "IDBIBK", 0);
    expect(r).not.toBeNull();
    expect(r!.currency).toBe("INR");
  });

  it("sets sender and timestamp on parsed result", () => {
    const msg = "IDBI Bank Acct XX7777 debited with Rs 300.00. Bal Rs 700.00";
    const r = parser.parse(msg, "IDBIBK", 1700000000000);
    expect(r).not.toBeNull();
    expect(r!.sender).toBe("IDBIBK");
    expect(r!.timestamp).toBe(1700000000000);
  });
});
