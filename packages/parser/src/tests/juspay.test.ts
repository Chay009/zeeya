import { describe, it, expect } from "vitest";
import { JuspayParser } from "../banks/juspay.js";

const parser = new JuspayParser();

describe("JuspayParser", () => {
  // ── canHandle ─────────────────────────────────────────────────────────────

  it("handles known senders", () => {
    // Direct matches
    expect(parser.canHandle("JUSPAY")).toBe(true);
    expect(parser.canHandle("APAY")).toBe(true);
    expect(parser.canHandle("AMAZON PAY")).toBe(true);
    // Contains-based matches (DLT patterns)
    expect(parser.canHandle("XX-JUSPAY-X")).toBe(true);
    expect(parser.canHandle("JM-JUSPAY-A")).toBe(true);
    // Non-matching senders
    expect(parser.canHandle("UNKNOWN")).toBe(false);
    expect(parser.canHandle("HDFC")).toBe(false);
  });

  // ── getBankName ───────────────────────────────────────────────────────────

  it("returns correct bank name", () => {
    expect(parser.getBankName()).toBe("Amazon Pay");
  });

  // ── wallet debit transactions (debited for INR) ───────────────────────────

  it("parses Apay wallet debit transaction", () => {
    const msg =
      "Your Apay Wallet balance is debited for INR 250.00 Transaction Reference Number is 123456789012 - Powered by Juspay";
    const r = parser.parse(msg, "JUSPAY", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(250);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.reference).toBe("123456789012");
    expect(r!.merchant).toBe("Amazon Pay Transaction");
    expect(r!.bankName).toBe("Amazon Pay");
  });

  it("parses wallet debit with different reference number", () => {
    const msg =
      "Your Apay Wallet balance is debited for INR 450.75 Transaction Reference Number is 987654321098 - Powered by Juspay";
    const r = parser.parse(msg, "JUSPAY", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(450.75);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.reference).toBe("987654321098");
    expect(r!.merchant).toBe("Amazon Pay Transaction");
  });

  it("parses small amount wallet debit", () => {
    const msg =
      "Your Apay Wallet balance is debited for INR 10.00 Transaction Reference Number is 555555555555 - Powered by Juspay";
    const r = parser.parse(msg, "JUSPAY", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(10);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.reference).toBe("555555555555");
    expect(r!.merchant).toBe("Amazon Pay Transaction");
  });

  // ── payment using Apay balance (successful at merchant) ──────────────────

  it("parses payment using Apay balance at generic merchant", () => {
    const msg =
      "Payment of Rs 150.50 using Apay Balance successful at merchant. Updated Balance is Rs 850.00 - SMS by Juspay";
    const r = parser.parse(msg, "APAY", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(150.5);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("merchant");
  });

  it("parses Amazon transaction via Juspay", () => {
    const msg =
      "Payment of Rs 1,250.00 using Apay Balance successful at Amazon. Updated Balance is Rs 2,500.00 - SMS by Juspay";
    const r = parser.parse(msg, "JUSPAY", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1250);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("Amazon");
  });

  it("parses Zepto delivery via Apay", () => {
    const msg =
      "Payment of Rs 85.25 using Apay Balance successful at Zepto. Updated Balance is Rs 1,200.00 - SMS by Juspay";
    const r = parser.parse(msg, "APAY", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(85.25);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("Zepto");
  });

  it("parses Flipkart transaction", () => {
    const msg =
      "Payment of Rs 2,999.00 using Apay Balance successful at Flipkart. Updated Balance is Rs 5,000.00 - SMS by Juspay";
    const r = parser.parse(msg, "JUSPAY", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2999);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("Flipkart");
  });

  it("parses large amount transaction at Amazon via AMAZON PAY sender", () => {
    const msg =
      "Payment of Rs 15,000.00 using Apay Balance successful at Amazon. Updated Balance is Rs 25,000.00 - SMS by Juspay";
    const r = parser.parse(msg, "AMAZON PAY", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(15000);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("Amazon");
  });

  it("parses generic merchant transaction (integer amount, new format)", () => {
    const msg =
      "Payment of Rs 500 using Apay Balance successful at merchant. Updated Balance is Rs 1500 - SMS by Juspay";
    const r = parser.parse(msg, "JUSPAY", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("merchant");
  });

  it("parses multi-word merchant name", () => {
    const msg =
      "Payment of Rs 750 using Apay Balance successful at Big Bazaar. Updated Balance is Rs 2500 - SMS by Juspay";
    const r = parser.parse(msg, "JUSPAY", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(750);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("Big Bazaar");
  });

  it("parses merchant name with special characters", () => {
    const msg =
      "Payment of Rs 1200 using Apay Balance successful at D'Mart Store. Updated Balance is Rs 3500 - SMS by Juspay";
    const r = parser.parse(msg, "APAY", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1200);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("D'Mart Store");
  });

  // ── factory-level sender resolution (from Kotlin factory test) ────────────

  it("factory resolves JUSPAY sender for wallet debit", () => {
    const msg =
      "Your Apay Wallet balance is debited for INR 200.00 Transaction Reference Number is 123456789012 - Powered by Juspay";
    const r = parser.parse(msg, "JUSPAY", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(200);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.reference).toBe("123456789012");
    expect(r!.merchant).toBe("Amazon Pay Transaction");
  });

  it("factory resolves APAY sender for Swiggy payment", () => {
    const msg =
      "Payment of Rs 350.00 using Apay Balance successful at Swiggy. Updated Balance is Rs 650.00 - SMS by Juspay";
    const r = parser.parse(msg, "APAY", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(350);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("Swiggy");
  });
});
