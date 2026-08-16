import { describe, it, expect } from "vitest";
import { IndianOverseasBankParser } from "../banks/indian-overseas.js";

const parser = new IndianOverseasBankParser();

describe("IndianOverseasBankParser", () => {
  // ── canHandle ─────────────────────────────────────────────────────────────

  it("handles known senders", () => {
    expect(parser.canHandle("JD-IOBCHN-S")).toBe(true);
    expect(parser.canHandle("IOBCHN")).toBe(true);
    expect(parser.canHandle("HDFCBK")).toBe(false);
    expect(parser.canHandle("")).toBe(false);
  });

  // ── getBankName ───────────────────────────────────────────────────────────

  it("returns correct bank name", () => {
    expect(parser.getBankName()).toBe("Indian Overseas Bank");
  });

  // ── Debited for named payee ───────────────────────────────────────────────

  it("parses debited for named payee", () => {
    const msg = [
      "Your a/c XX1234 debited for payee SAMPLE MERCHANT for Rs. 150.00",
      "on 2026-03-25, ref 123456789012.If not you, report to your bank immediately-IOB.",
    ].join("\n");
    const r = parser.parse(msg, "BZ-IOBCHN-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(150.0);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("SAMPLE MERCHANT");
    expect(r!.accountLast4).toBe("1234");
    expect(r!.reference).toBe("123456789012");
    expect(r!.bankName).toBe("Indian Overseas Bank");
  });

  // ── Debited for VPA payee ─────────────────────────────────────────────────

  it("parses debited for VPA payee", () => {
    const msg = [
      "Your a/c XX1234 debited for payee samplepayee@bank for Rs. 996.00",
      "on 2026-02-03, ref 123456789013.If not you, report to your bank immediately-IOB.",
    ].join("\n");
    const r = parser.parse(msg, "VA-IOBCHN-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(996.0);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("samplepayee");
    expect(r!.accountLast4).toBe("1234");
    expect(r!.reference).toBe("123456789013");
  });

  // ── SMS charge debit ──────────────────────────────────────────────────────

  it("parses SMS charge debit", () => {
    const msg = [
      "Rs.20.64 Debited to SB-xxx1234 AcBal:65162.78 CLRBal: 65206.60",
      "[CHRGS- SMS ] BRANCH ONE on 23-05-2026 08:00:39.IOB.",
    ].join("\n");
    const r = parser.parse(msg, "JD-IOBCHN-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(20.64);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("SMS Charges");
    expect(r!.accountLast4).toBe("1234");
    expect(r!.balance).toBe(65162.78);
  });

  // ── Balance credit with account and AcBal ────────────────────────────────

  it("parses balance credit with account and AcBal", () => {
    const msg = [
      "Rs.4740.08 Credited to SB-xxx1234 AcBal:65040.08 CLRBal: 65083.90",
      "[NEFT-CITI- ] SAMPLE-BRANCH on 20-05-2026 15:01:34.IOB.",
    ].join("\n");
    const r = parser.parse(msg, "JD-IOBCHN-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(4740.08);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("INCOME");
    expect(r!.merchant).toBe("CITI");
    expect(r!.accountLast4).toBe("1234");
    expect(r!.balance).toBe(65040.08);
  });

  // ── UPI balance debit extracts account and balance ────────────────────────

  it("parses UPI balance debit with account and balance", () => {
    const msg = [
      "Rs.70000.00 Debited to SB-xxx1234 AcBal:8054.76 CLRBal: 8098.58",
      "[UPI/636773 ] SAMPLE-BRANCH on 01-01-2026 16:11:16.IOB.",
    ].join("\n");
    const r = parser.parse(msg, "VM-IOBCHN-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(70000.0);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("UPI");
    expect(r!.accountLast4).toBe("1234");
    expect(r!.balance).toBe(8054.76);
    expect(r!.reference).toBe("636773");
  });

  // ── Pure IMPS bracket is reference not merchant ───────────────────────────

  it("extracts reference from pure IMPS bracket, not merchant", () => {
    const msg = [
      "Rs.500.00 Debited to SB-xxx1234 AcBal:1000.00 CLRBal: 1000.00",
      "[IMPS/ 123456] SAMPLE-BRANCH on 01-01-2026 16:11:16.IOB.",
    ].join("\n");
    const r = parser.parse(msg, "VM-IOBCHN-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500.0);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.accountLast4).toBe("1234");
    expect(r!.balance).toBe(1000.0);
    expect(r!.reference).toBe("123456");
  });

  // ── Combined UPI IMPS bracket extracts reference ──────────────────────────

  it("parses combined UPI/IMPS bracket and extracts reference", () => {
    const msg = [
      "Rs.250.00 Debited to SB-xxx1234 AcBal:750.00 CLRBal: 750.00",
      "[UPI/IMPS/ 654321] SAMPLE-BRANCH on 01-01-2026 16:11:16.IOB.",
    ].join("\n");
    const r = parser.parse(msg, "VM-IOBCHN-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(250.0);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("UPI");
    expect(r!.accountLast4).toBe("1234");
    expect(r!.balance).toBe(750.0);
    expect(r!.reference).toBe("654321");
  });

  // ── UPI credit detail with short masked account ───────────────────────────

  it("parses UPI credit detail with short masked account", () => {
    const msg = [
      "Your a/c no. XXXXX99 is credited by Rs.10000.00 on 2026-05-04 19:35:21.874,",
      "from SAMPLE PAYER-samplepayer@bank(UPI Ref no 122603588789).Payer Remark - UPI -IOB",
    ].join("\n");
    const r = parser.parse(msg, "BV-IOBCHN-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(10000.0);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("INCOME");
    expect(r!.merchant).toBe("UPI - SAMPLE PAYER (samplepayer@bank)");
    expect(r!.accountLast4).toBe("99");
    expect(r!.reference).toBe("122603588789");
  });

  // ── Towards account debit format ──────────────────────────────────────────

  it("parses towards account debit format", () => {
    const msg = [
      "Your account has been debited towards XXXX1234 for Rs. 4383.00 on 03/07/2025.",
      "If not you, contact tollfree 18008904445. -IOB",
    ].join("\n");
    const r = parser.parse(msg, "BZ-IOBCHN-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(4383.0);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.accountLast4).toBe("1234");
  });

  // ── IMPS credit detail format ─────────────────────────────────────────────

  it("parses IMPS credit detail format", () => {
    const msg = [
      "Dear Customer, Your A/C:XXX1234 is credited by Rs. 1.00 on 07/07/2025",
      "from a/c XXX3413 (IMPS Ref id:518809468661)? IOB",
    ].join("\n");
    const r = parser.parse(msg, "AD-IOBCHN-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1.0);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("INCOME");
    expect(r!.accountLast4).toBe("1234");
  });

  // ── Future SMS charge notice should not parse ─────────────────────────────

  it("does not parse future SMS charge notice", () => {
    const msg = [
      "Dear Customer, Applicable SMS charges will be debited from your SB/CA/CC acct",
      "for the period Oct-Dec 2025. For details, pls visit our website/Branch-IOB",
    ].join("\n");
    expect(parser.parse(msg, "VA-IOBCHN-S", 0)).toBeNull();
  });

  // ── Disabled card transaction notice should not parse ─────────────────────

  it("does not parse disabled card transaction notice", () => {
    const msg = [
      "Dear Customer, ECOM txn is not enabled for your Debit Card xx1234.",
      "Pls enable Ecom txns using Internet Banking or by visiting your branch - IOB",
    ].join("\n");
    expect(parser.parse(msg, "AD-IOBCHN", 0)).toBeNull();
  });
});
