import { describe, it, expect } from "vitest";
import { IPPBParser } from "../banks/ippb.js";

const parser = new IPPBParser();

describe("IPPBParser", () => {
  // ── getBankName ───────────────────────────────────────────────────────────

  it("returns correct bank name", () => {
    expect(parser.getBankName()).toBe("India Post Payments Bank");
  });

  // ── canHandle ─────────────────────────────────────────────────────────────

  it("handles XX-IPBMSG-S sender pattern", () => {
    expect(parser.canHandle("CP-IPBMSG-S")).toBe(true);
    expect(parser.canHandle("AX-IPBMSG-S")).toBe(true);
    expect(parser.canHandle("IN-IPBMSG-S")).toBe(true);
  });

  it("handles XX-IPBMSG-T sender pattern", () => {
    expect(parser.canHandle("CP-IPBMSG-T")).toBe(true);
    expect(parser.canHandle("AX-IPBMSG-T")).toBe(true);
    expect(parser.canHandle("TM-IPBMSG-T")).toBe(true);
  });

  it("handles lowercase sender by normalising to uppercase", () => {
    expect(parser.canHandle("cp-ipbmsg-s")).toBe(true);
    expect(parser.canHandle("ax-ipbmsg-t")).toBe(true);
  });

  it("rejects non-IPPB senders", () => {
    expect(parser.canHandle("HDFCBK")).toBe(false);
    expect(parser.canHandle("SBI")).toBe(false);
    expect(parser.canHandle("IPBMSG")).toBe(false);
    expect(parser.canHandle("CP-IPBMSG")).toBe(false);
    expect(parser.canHandle("CP-IPBMSG-X")).toBe(false);
    expect(parser.canHandle("")).toBe(false);
  });

  // ── debit transactions ────────────────────────────────────────────────────

  it("parses debit transaction with UPI VPA", () => {
    const msg = "Your A/C X1234 Debit Rs.500.00 to john@upi. Avl Bal Rs.1000.00 Ref 560002638161";
    const r = parser.parse(msg, "CP-IPBMSG-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.type).toBe("EXPENSE");
    expect(r!.accountLast4).toBe("1234");
    expect(r!.balance).toBe(1000);
    expect(r!.reference).toBe("560002638161");
    expect(r!.merchant).toBe("john");
    expect(r!.bankName).toBe("India Post Payments Bank");
    expect(r!.currency).toBe("INR");
  });

  it("parses debit transaction with comma-formatted amount", () => {
    const msg =
      "Your A/C X5678 Debit Rs.1,500.00 to merchant@superyes. Avl Bal Rs.8,500.00 Ref 123456789";
    const r = parser.parse(msg, "AX-IPBMSG-T", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1500);
    expect(r!.type).toBe("EXPENSE");
    expect(r!.accountLast4).toBe("5678");
    expect(r!.balance).toBe(8500);
    expect(r!.merchant).toBe("merchant");
    expect(r!.reference).toBe("123456789");
  });

  it("parses debit transaction to plain merchant name (no UPI @)", () => {
    // Note: the "to <merchant>" regex captures non-whitespace, so the merchant
    // token must not be followed by punctuation that would become part of it.
    const msg = "Your A/C X9012 Debit Rs.200.00 to SOMEMERCHANT Avl Bal Rs.3000.00 Ref 987654321";
    const r = parser.parse(msg, "CP-IPBMSG-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(200);
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("SOMEMERCHANT");
  });

  it('returns UPI Payment as merchant when "for upi" present but no specific merchant', () => {
    const msg = "Your A/C X3456 Debit Rs.300.00 for UPI payment. Avl Bal Rs.700.00 Ref 111222333";
    const r = parser.parse(msg, "CP-IPBMSG-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(300);
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("UPI Payment");
  });

  // ── credit / received payment transactions ────────────────────────────────

  it("parses received payment (credit via UPI) with sender name", () => {
    const msg =
      "You have received a payment of Rs.1000.00 from John Doe thru IPPB. A/C X5678. Avl Bal Rs.5000.00. Info: UPI/CREDIT/523498793035";
    const r = parser.parse(msg, "CP-IPBMSG-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1000);
    expect(r!.type).toBe("INCOME");
    expect(r!.merchant).toBe("John Doe");
    expect(r!.accountLast4).toBe("5678");
    expect(r!.balance).toBe(5000);
    expect(r!.reference).toBe("523498793035");
  });

  it("parses credit via Info: UPI/CREDIT pattern", () => {
    const msg = "A/C X7890 credit Rs.2500.00. Avl Bal Rs.10000.00. Info: UPI/CREDIT/998877665544";
    const r = parser.parse(msg, "AX-IPBMSG-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2500);
    expect(r!.type).toBe("INCOME");
    expect(r!.accountLast4).toBe("7890");
    expect(r!.balance).toBe(10000);
    expect(r!.reference).toBe("998877665544");
  });

  // ── amount extraction ─────────────────────────────────────────────────────

  it("extracts amount from Rs. (with space) pattern", () => {
    const msg = "Your A/C X1111 Debit Rs. 750.50 to vendor@pay. Avl Bal Rs. 250.00 Ref 555666777";
    const r = parser.parse(msg, "CP-IPBMSG-T", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(750.5);
  });

  // ── account last4 extraction ──────────────────────────────────────────────

  it("extracts last 4 digits when account number longer than 4 digits", () => {
    const msg = "Your A/C X123456789 Debit Rs.100.00 to pay@upi. Avl Bal Rs.900.00 Ref 100200300";
    const r = parser.parse(msg, "CP-IPBMSG-S", 0);
    expect(r).not.toBeNull();
    expect(r!.accountLast4).toBe("6789");
  });

  it("extracts full number when account number less than 4 digits", () => {
    const msg = "Your A/C X123 Debit Rs.50.00 to test@upi. Avl Bal Rs.450.00 Ref 400500600";
    const r = parser.parse(msg, "CP-IPBMSG-S", 0);
    expect(r).not.toBeNull();
    expect(r!.accountLast4).toBe("123");
  });

  it("handles A/C without X prefix", () => {
    const msg = "Your A/C 4321 Debit Rs.250.00 to shop@pay. Avl Bal Rs.750.00 Ref 700800900";
    const r = parser.parse(msg, "CP-IPBMSG-S", 0);
    expect(r).not.toBeNull();
    expect(r!.accountLast4).toBe("4321");
  });

  // ── balance extraction ────────────────────────────────────────────────────

  it("extracts balance from Avl Bal Rs. pattern", () => {
    const msg = "Your A/C X2222 Debit Rs.100.00 to abc@def. Avl Bal Rs.436.91 Ref 111000111";
    const r = parser.parse(msg, "CP-IPBMSG-S", 0);
    expect(r).not.toBeNull();
    expect(r!.balance).toBe(436.91);
  });

  it("extracts balance from Avl Bal Rs. with comma-formatted amount", () => {
    const msg = "Your A/C X3333 Debit Rs.500.00 to shop@pay. Avl Bal Rs.12,345.67 Ref 222333444";
    const r = parser.parse(msg, "AX-IPBMSG-T", 0);
    expect(r).not.toBeNull();
    expect(r!.balance).toBe(12345.67);
  });

  // ── reference extraction ──────────────────────────────────────────────────

  it("extracts reference from Ref pattern", () => {
    const msg = "Your A/C X4444 Debit Rs.100.00 to vendor@upi. Avl Bal Rs.900.00 Ref 560002638161";
    const r = parser.parse(msg, "CP-IPBMSG-S", 0);
    expect(r).not.toBeNull();
    expect(r!.reference).toBe("560002638161");
  });

  it("extracts reference from Info: UPI/CREDIT/ pattern", () => {
    const msg =
      "You have received a payment of Rs.500.00 from Test User thru IPPB. A/C X5555. Avl Bal Rs.1500.00. Info: UPI/CREDIT/523498793035";
    const r = parser.parse(msg, "CP-IPBMSG-S", 0);
    expect(r).not.toBeNull();
    expect(r!.reference).toBe("523498793035");
  });

  // ── isTransactionMessage ──────────────────────────────────────────────────

  it('identifies "debit rs" messages as transactions', () => {
    const msg = "Your A/C X6666 Debit Rs.200.00 to someone@upi. Avl Bal Rs.800.00 Ref 999888777";
    // parse returns non-null means it was identified as a transaction
    expect(parser.parse(msg, "CP-IPBMSG-S", 0)).not.toBeNull();
  });

  it('identifies "received a payment" messages as transactions', () => {
    const msg =
      "You have received a payment of Rs.300.00 from Alice thru IPPB. A/C X7777. Avl Bal Rs.1300.00. Info: UPI/CREDIT/111222333444";
    expect(parser.parse(msg, "CP-IPBMSG-S", 0)).not.toBeNull();
  });

  // ── non-transaction messages ──────────────────────────────────────────────

  it("does not parse OTP messages", () => {
    const msg = "Your OTP for IPPB login is 123456. Do not share this with anyone.";
    expect(parser.parse(msg, "CP-IPBMSG-S", 0)).toBeNull();
  });

  it("does not parse promotional / offer messages", () => {
    const msg = "Exciting offer! Get cashback offer on IPPB transactions. T&C apply.";
    expect(parser.parse(msg, "CP-IPBMSG-S", 0)).toBeNull();
  });

  it("does not parse messages without an amount", () => {
    const msg = "Your A/C X8888 has been debited. Contact IPPB for details.";
    expect(parser.parse(msg, "CP-IPBMSG-S", 0)).toBeNull();
  });
});
