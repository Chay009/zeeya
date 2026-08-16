import { describe, it, expect } from "vitest";
import { OneCardParser } from "../banks/one-card.js";

const parser = new OneCardParser();

describe("OneCardParser", () => {
  // ── canHandle ────────────────────────────────────────────────────────────

  it("handles known senders", () => {
    expect(parser.canHandle("ONECRD")).toBe(true);
    expect(parser.canHandle("ONECAD")).toBe(true);
    expect(parser.canHandle("ONECARD")).toBe(true);
    expect(parser.canHandle("AD-ONECRD")).toBe(true);
    expect(parser.canHandle("JK-ONECRD")).toBe(true);
    expect(parser.canHandle("VM-ONECAD")).toBe(true);
    // Non-OneCard senders
    expect(parser.canHandle("HDFCBK")).toBe(false);
    expect(parser.canHandle("AD-ICICIB")).toBe(false);
    expect(parser.canHandle("")).toBe(false);
  });

  // ── isTransactionMessage (positive) ──────────────────────────────────────

  it('accepts message with "onecard" keyword', () => {
    const r = parser.parse(
      "Your OneCard ending 1234 has been used for Rs.500.00 at SWIGGY on 01 Jan 2025 at 12:00 PM. Avl Limit: Rs.45000.00",
      "ONECRD",
      0,
    );
    expect(r).not.toBeNull();
  });

  it('accepts message with "avl limit" keyword', () => {
    const r = parser.parse(
      "Txn of Rs.250.00 on OneCard XX5678 at AMAZON. Avl Limit: Rs.9750.00",
      "AD-ONECRD",
      0,
    );
    expect(r).not.toBeNull();
  });

  it('accepts message with "avl lmt" keyword', () => {
    const r = parser.parse(
      "Txn of Rs.1,234.56 on OneCard XX1234 at ZOMATO on 01-01-2025. Avl Lmt Rs.50,000.00",
      "JK-ONECRD",
      0,
    );
    expect(r).not.toBeNull();
  });

  // ── isTransactionMessage (negative) ──────────────────────────────────────

  it("rejects OTP message", () => {
    const r = parser.parse(
      "Your OTP for OneCard transaction is 123456. Do not share with anyone.",
      "ONECRD",
      0,
    );
    expect(r).toBeNull();
  });

  it("rejects PIN message", () => {
    const r = parser.parse("Your OneCard PIN has been set successfully.", "ONECRD", 0);
    expect(r).toBeNull();
  });

  it("rejects password message", () => {
    const r = parser.parse("Your OneCard password was changed successfully.", "AD-ONECRD", 0);
    expect(r).toBeNull();
  });

  it("rejects block message", () => {
    const r = parser.parse(
      "Your OneCard ending 1234 has been blocked as per your request.",
      "ONECRD",
      0,
    );
    expect(r).toBeNull();
  });

  // ── Amount extraction ─────────────────────────────────────────────────────

  it("parses simple Rs. amount", () => {
    const r = parser.parse(
      "Your OneCard ending 1234 has been used for Rs.500.00 at SWIGGY on 01 Jan 2025 at 12:00 PM. Avl Limit: Rs.45000.00",
      "ONECRD",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500.0);
  });

  it("parses comma-formatted amount", () => {
    const r = parser.parse(
      "Txn of Rs.1,234.56 on OneCard XX1234 at ZOMATO on 01-01-2025. Avl Lmt Rs.50,000.00",
      "JK-ONECRD",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1234.56);
  });

  it("parses INR-prefixed amount", () => {
    const r = parser.parse(
      "OneCard XX1234 - Transaction of INR 500.00 at NETFLIX on 15/06/2025",
      "AD-ONECRD",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500.0);
  });

  // ── Transaction type (always CREDIT) ─────────────────────────────────────

  it("returns CREDIT type for all spend transactions", () => {
    const r = parser.parse(
      "Your OneCard ending 5678 has been used for Rs.250.00 at MERCHANT on 01 Jan 2025 at 12:00 PM. Avl Limit: Rs.9750.00",
      "ONECRD",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.type).toBe("CREDIT");
  });

  it('returns CREDIT type for "Txn of" format', () => {
    const r = parser.parse(
      "Txn of Rs.1,234.56 on OneCard XX1234 at AMAZON on 01-01-2025. Avl Lmt Rs.50,000.00",
      "JK-ONECRD",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.type).toBe("CREDIT");
  });

  // ── Merchant extraction ───────────────────────────────────────────────────

  it('extracts merchant from "at MERCHANT on DD Mon"', () => {
    const r = parser.parse(
      "Your OneCard ending 1234 has been used for Rs.500.00 at SWIGGY on 01 Jan 2025 at 12:00 PM. Avl Limit: Rs.45000.00",
      "ONECRD",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe("SWIGGY");
  });

  it('extracts merchant from "at MERCHANT on DD-MM-YYYY"', () => {
    const r = parser.parse(
      "Txn of Rs.1,234.56 on OneCard XX1234 at ZOMATO on 01-01-2025. Avl Lmt Rs.50,000.00",
      "JK-ONECRD",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe("ZOMATO");
  });

  it('extracts merchant from "at MERCHANT." (sentence end)', () => {
    const r = parser.parse(
      "Rs.250.00 spent on your OneCard XX5678 at NETFLIX. Available Limit: Rs.9750.00",
      "ONECRD",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe("NETFLIX");
  });

  it("extracts multi-word merchant name", () => {
    const r = parser.parse(
      "OneCard XX1234 - Transaction of INR 500.00 at AMAZON SELLER SERVICES on 15/06/2025",
      "AD-ONECRD",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe("AMAZON SELLER SERVICES");
  });

  // ── Card last4 extraction ─────────────────────────────────────────────────

  it('extracts last4 from "ending XXXX"', () => {
    const r = parser.parse(
      "Your OneCard ending 1234 has been used for Rs.500.00 at SWIGGY on 01 Jan 2025 at 12:00 PM. Avl Limit: Rs.45000.00",
      "ONECRD",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.accountLast4).toBe("1234");
  });

  it('extracts last4 from "OneCard XX1234"', () => {
    const r = parser.parse(
      "Txn of Rs.1,234.56 on OneCard XX1234 at ZOMATO on 01-01-2025. Avl Lmt Rs.50,000.00",
      "JK-ONECRD",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.accountLast4).toBe("1234");
  });

  it('extracts last4 from "OneCard XX5678"', () => {
    const r = parser.parse(
      "Rs.250.00 spent on your OneCard XX5678 at MERCHANT. Available Limit: Rs.9750.00",
      "ONECRD",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.accountLast4).toBe("5678");
  });

  // ── Available limit extraction ────────────────────────────────────────────

  it('extracts available limit from "Avl Limit: Rs."', () => {
    const r = parser.parse(
      "Your OneCard ending 1234 has been used for Rs.500.00 at SWIGGY on 01 Jan 2025 at 12:00 PM. Avl Limit: Rs.45000.00",
      "ONECRD",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.creditLimit).toBe(45000.0);
  });

  it('extracts available limit from "Avl Lmt Rs."', () => {
    const r = parser.parse(
      "Txn of Rs.1,234.56 on OneCard XX1234 at ZOMATO on 01-01-2025. Avl Lmt Rs.50,000.00",
      "JK-ONECRD",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.creditLimit).toBe(50000.0);
  });

  it('extracts available limit from "Available Limit: Rs."', () => {
    const r = parser.parse(
      "Rs.250.00 spent on your OneCard XX5678 at MERCHANT. Available Limit: Rs.9750.00",
      "ONECRD",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.creditLimit).toBe(9750.0);
  });

  // ── Bank name & currency ──────────────────────────────────────────────────

  it("returns correct bank name", () => {
    const r = parser.parse(
      "Your OneCard ending 1234 has been used for Rs.500.00 at SWIGGY on 01 Jan 2025. Avl Limit: Rs.45000.00",
      "ONECRD",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.bankName).toBe("OneCard");
  });

  it("returns INR currency", () => {
    const r = parser.parse(
      "Your OneCard ending 1234 has been used for Rs.500.00 at SWIGGY on 01 Jan 2025. Avl Limit: Rs.45000.00",
      "ONECRD",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.currency).toBe("INR");
  });
});
