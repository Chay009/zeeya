import { describe, it, expect } from "vitest";
import { LazyPayParser } from "../banks/lazypay.js";

const parser = new LazyPayParser();

describe("LazyPayParser", () => {
  // ── canHandle ─────────────────────────────────────────────────────────────

  it("handles known senders", () => {
    // Contains "LZYPAY"
    expect(parser.canHandle("BP-LZYPAY-S")).toBe(true);
    expect(parser.canHandle("JM-LZYPAY-S")).toBe(true);
    expect(parser.canHandle("JD-LZYPAY-S")).toBe(true);
    expect(parser.canHandle("LZYPAY")).toBe(true);
    // Contains "LAZYPAY"
    expect(parser.canHandle("LAZYPAY")).toBe(true);
    expect(parser.canHandle("AD-LAZYPAY-T")).toBe(true);
    // Non-matching senders
    expect(parser.canHandle("UNKNOWN")).toBe(false);
    expect(parser.canHandle("HDFC")).toBe(false);
    expect(parser.canHandle("JUSPAY")).toBe(false);
  });

  // ── getBankName ───────────────────────────────────────────────────────────

  it("returns correct bank name", () => {
    expect(parser.getBankName()).toBe("LazyPay");
  });

  // ── isTransactionMessage ─────────────────────────────────────────────────

  it("accepts payment successful messages", () => {
    const msg =
      "Payment of Rs. 235.76 for txn TXN512924131 on Zepto Marketplace was successful. Your LazyPay limit is now Rs. 4764.24.";
    expect(parser.parse(msg, "BP-LZYPAY-S", 0)).not.toBeNull();
  });

  it("accepts repayment messages", () => {
    const msg =
      "Thanks for your payment of Rs. 500.00 against your LazyPay statement. Your LazyPay limit is now Rs. 5000.00.";
    expect(parser.parse(msg, "JM-LZYPAY-S", 0)).not.toBeNull();
  });

  it("rejects failed payment messages", () => {
    const msg = "Payment of Rs. 100.00 could not be processed due to a failure. Please try again.";
    expect(parser.parse(msg, "BP-LZYPAY-S", 0)).toBeNull();
  });

  it("rejects unsuccessful messages", () => {
    const msg = "Your transaction of Rs. 200.00 was unsuccessful. Please retry.";
    expect(parser.parse(msg, "BP-LZYPAY-S", 0)).toBeNull();
  });

  it("rejects payment failed messages", () => {
    const msg = "Payment failed for Rs. 150.00 order. Please check your account.";
    expect(parser.parse(msg, "BP-LZYPAY-S", 0)).toBeNull();
  });

  it("rejects transaction failed messages", () => {
    const msg = "Transaction failed for Rs. 300.00. Please try again.";
    expect(parser.parse(msg, "BP-LZYPAY-S", 0)).toBeNull();
  });

  it("rejects promotional offer messages without payment keyword", () => {
    const msg = "Exclusive offer! Get cashback on your next purchase. Explore more deals.";
    expect(parser.parse(msg, "BP-LZYPAY-S", 0)).toBeNull();
  });

  it("rejects get cashback messages without payment keyword", () => {
    const msg = "Get cashback of Rs. 50 on your next transaction!";
    expect(parser.parse(msg, "BP-LZYPAY-S", 0)).toBeNull();
  });

  // ── transaction type always CREDIT ───────────────────────────────────────

  it("always returns CREDIT as transaction type", () => {
    const msg =
      "Payment of Rs. 235.76 for txn TXN512924131 on Zepto Marketplace was successful. Your LazyPay limit is now Rs. 4764.24.";
    const r = parser.parse(msg, "BP-LZYPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.type).toBe("CREDIT");
  });

  // ── amount extraction ─────────────────────────────────────────────────────

  it("parses amount with decimal (Rs.)", () => {
    const msg =
      "Payment of Rs. 235.76 for txn TXN512924131 on Zepto Marketplace was successful. Your LazyPay limit is now Rs. 4764.24.";
    const r = parser.parse(msg, "BP-LZYPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(235.76);
  });

  it("parses amount with Rs (no period)", () => {
    const msg =
      "Payment of Rs 500 for txn TXN123456789 on Swiggy was successful. Your LazyPay limit is now Rs 4500.";
    const r = parser.parse(msg, "JM-LZYPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
  });

  it("parses amount with comma-separated thousands", () => {
    const msg =
      "Payment of Rs. 1,250.00 for txn TXN987654321 on Zomato was successful. Your LazyPay limit is now Rs. 3,750.00.";
    const r = parser.parse(msg, "BP-LZYPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1250);
  });

  it("parses repayment amount", () => {
    const msg =
      "Thanks for your payment of Rs. 500.00 against your LazyPay statement. Your LazyPay limit is now Rs. 5000.00.";
    const r = parser.parse(msg, "JM-LZYPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
  });

  // ── merchant extraction ───────────────────────────────────────────────────

  it("maps Zepto Marketplace to Zepto", () => {
    const msg =
      "Payment of Rs. 235.76 for txn TXN512924131 on Zepto Marketplace was successful. Your LazyPay limit is now Rs. 4764.24.";
    const r = parser.parse(msg, "BP-LZYPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe("Zepto");
  });

  it("maps Innovative Retail Concepts to BigBasket", () => {
    const msg =
      "Payment of Rs. 899.00 for txn TXN112233445 on Innovative Retail Concepts was successful. Your LazyPay limit is now Rs. 4101.00.";
    const r = parser.parse(msg, "BP-LZYPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe("BigBasket");
  });

  it("maps Swiggy to Swiggy", () => {
    const msg =
      "Payment of Rs. 349.00 for txn TXN556677889 on Swiggy was successful. Your LazyPay limit is now Rs. 4651.00.";
    const r = parser.parse(msg, "BP-LZYPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe("Swiggy");
  });

  it("maps Zomato to Zomato", () => {
    const msg =
      "Payment of Rs. 450.00 for txn TXN998877665 on Zomato was successful. Your LazyPay limit is now Rs. 4550.00.";
    const r = parser.parse(msg, "JD-LZYPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe("Zomato");
  });

  it("strips Private Limited suffix from merchant", () => {
    const msg =
      "Payment of Rs. 199.00 for txn TXN444555666 on Acme Services Private Limited was successful.";
    const r = parser.parse(msg, "BP-LZYPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe("Acme Services");
  });

  it("strips Pvt Ltd suffix from merchant", () => {
    const msg = "Payment of Rs. 299.00 for txn TXN777888999 on XYZ Pvt Ltd was successful.";
    const r = parser.parse(msg, "BP-LZYPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe("XYZ");
  });

  it("returns LazyPay Repayment for statement repayment", () => {
    const msg =
      "Thanks for your payment of Rs. 500.00 against your LazyPay statement. Your LazyPay limit is now Rs. 5000.00.";
    const r = parser.parse(msg, "JM-LZYPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe("LazyPay Repayment");
  });

  // ── reference extraction ──────────────────────────────────────────────────

  it("extracts transaction reference TXN ID", () => {
    const msg =
      "Payment of Rs. 235.76 for txn TXN512924131 on Zepto Marketplace was successful. Your LazyPay limit is now Rs. 4764.24.";
    const r = parser.parse(msg, "BP-LZYPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.reference).toBe("TXN512924131");
  });

  it("extracts another TXN reference", () => {
    const msg =
      "Payment of Rs. 349.00 for txn TXN556677889 on Swiggy was successful. Your LazyPay limit is now Rs. 4651.00.";
    const r = parser.parse(msg, "BP-LZYPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.reference).toBe("TXN556677889");
  });

  // ── metadata ──────────────────────────────────────────────────────────────

  it("sets correct bank name on parsed transaction", () => {
    const msg =
      "Payment of Rs. 235.76 for txn TXN512924131 on Zepto Marketplace was successful. Your LazyPay limit is now Rs. 4764.24.";
    const r = parser.parse(msg, "BP-LZYPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.bankName).toBe("LazyPay");
  });

  it("sets correct sender on parsed transaction", () => {
    const msg =
      "Payment of Rs. 235.76 for txn TXN512924131 on Zepto Marketplace was successful. Your LazyPay limit is now Rs. 4764.24.";
    const r = parser.parse(msg, "BP-LZYPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.sender).toBe("BP-LZYPAY-S");
  });

  it("sets currency to INR", () => {
    const msg =
      "Payment of Rs. 235.76 for txn TXN512924131 on Zepto Marketplace was successful. Your LazyPay limit is now Rs. 4764.24.";
    const r = parser.parse(msg, "BP-LZYPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.currency).toBe("INR");
  });

  // ── full parse scenarios ──────────────────────────────────────────────────

  it("parses Zepto Marketplace payment in full", () => {
    const msg =
      "Payment of Rs. 235.76 for txn TXN512924131 on Zepto Marketplace was successful. Your LazyPay limit is now Rs. 4764.24.";
    const r = parser.parse(msg, "BP-LZYPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(235.76);
    expect(r!.type).toBe("CREDIT");
    expect(r!.merchant).toBe("Zepto");
    expect(r!.reference).toBe("TXN512924131");
    expect(r!.bankName).toBe("LazyPay");
    expect(r!.currency).toBe("INR");
  });

  it("parses Swiggy payment in full", () => {
    const msg =
      "Payment of Rs. 349.00 for txn TXN556677889 on Swiggy was successful. Your LazyPay limit is now Rs. 4651.00.";
    const r = parser.parse(msg, "JD-LZYPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(349);
    expect(r!.type).toBe("CREDIT");
    expect(r!.merchant).toBe("Swiggy");
    expect(r!.reference).toBe("TXN556677889");
    expect(r!.bankName).toBe("LazyPay");
  });

  it("parses BigBasket payment in full", () => {
    const msg =
      "Payment of Rs. 899.00 for txn TXN112233445 on Innovative Retail Concepts was successful. Your LazyPay limit is now Rs. 4101.00.";
    const r = parser.parse(msg, "BP-LZYPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(899);
    expect(r!.type).toBe("CREDIT");
    expect(r!.merchant).toBe("BigBasket");
    expect(r!.reference).toBe("TXN112233445");
  });

  it("parses LazyPay statement repayment in full", () => {
    const msg =
      "Thanks for your payment of Rs. 500.00 against your LazyPay statement. Your LazyPay limit is now Rs. 5000.00.";
    const r = parser.parse(msg, "JM-LZYPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.type).toBe("CREDIT");
    expect(r!.merchant).toBe("LazyPay Repayment");
    expect(r!.bankName).toBe("LazyPay");
  });

  it("parses large amount Zomato transaction", () => {
    const msg =
      "Payment of Rs. 1,250.00 for txn TXN987654321 on Zomato was successful. Your LazyPay limit is now Rs. 3,750.00.";
    const r = parser.parse(msg, "BP-LZYPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1250);
    expect(r!.type).toBe("CREDIT");
    expect(r!.merchant).toBe("Zomato");
    expect(r!.reference).toBe("TXN987654321");
  });
});
