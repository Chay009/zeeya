import { describe, it, expect } from "vitest";
import { JioPayParser } from "../banks/jio-pay.js";

const parser = new JioPayParser();

describe("JioPayParser", () => {
  // ── getBankName ───────────────────────────────────────────────────────────

  it("returns correct bank name", () => {
    expect(parser.getBankName()).toBe("JioPay");
  });

  // ── canHandle ─────────────────────────────────────────────────────────────

  it("handles sender containing JIOPAY", () => {
    expect(parser.canHandle("JIOPAY")).toBe(true);
    expect(parser.canHandle("AD-JIOPAY")).toBe(true);
  });

  it("handles exact senders JA-JIOPAY-S and JM-JIOPAY", () => {
    expect(parser.canHandle("JA-JIOPAY-S")).toBe(true);
    expect(parser.canHandle("JM-JIOPAY")).toBe(true);
    expect(parser.canHandle("jiopay")).toBe(true);
  });

  it("rejects unrelated senders", () => {
    expect(parser.canHandle("HDFCBK")).toBe(false);
    expect(parser.canHandle("JIOPBS")).toBe(false);
    expect(parser.canHandle("SBIBNK")).toBe(false);
    expect(parser.canHandle("")).toBe(false);
  });

  // ── transaction type (always CREDIT) ─────────────────────────────────────

  it("always marks wallet transactions as CREDIT to avoid double-counting", () => {
    const msg =
      "Plan Name : 249.00 activated for Jio Number : 9876543210. Recharge successful. Transaction ID : BR000CAUBYON";
    const r = parser.parse(msg, "JA-JIOPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.type).toBe("CREDIT");
  });

  // Kotlin isTransactionMessage only checks "recharge successful"; "payment successful"
  // alone is not recognised — base class also doesn't match it, so parse() returns null.
  it("does not parse payment-successful-to message (not a recognised keyword in Kotlin)", () => {
    const msg = "Payment successful to Swiggy for Rs. 350.00. Transaction ID : BR000SWG001";
    const r = parser.parse(msg, "JA-JIOPAY-S", 0);
    expect(r).toBeNull();
  });

  // ── amount: Plan Name pattern ─────────────────────────────────────────────

  it("extracts amount from Plan Name pattern", () => {
    const msg =
      "Plan Name : 249.00 activated for Jio Number : 9876543210. Recharge successful. Transaction ID : BR000CAUBYON";
    const r = parser.parse(msg, "JA-JIOPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(249.0);
  });

  it("extracts comma-separated amount from Plan Name pattern", () => {
    const msg =
      "Plan Name : 2,999.00 activated for Jio Number : 9876543210. Recharge successful. Transaction ID : BR000PLAN99";
    const r = parser.parse(msg, "JA-JIOPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2999.0);
  });

  // ── amount: Rs. pattern ───────────────────────────────────────────────────

  // "payment successful" is not a recognised transaction keyword in Kotlin JioPayParser;
  // these messages return null from parse().
  it("returns null for payment-successful message (not recognised by Kotlin parser)", () => {
    const msg = "Payment successful to Swiggy for Rs. 350.00. Transaction ID : BR000SWG001";
    expect(parser.parse(msg, "JA-JIOPAY-S", 0)).toBeNull();
  });

  it("returns null for comma-amount payment-successful message", () => {
    const msg = "Payment successful to Vendor for Rs. 1,200.00. Transaction ID : BR001TEST99";
    expect(parser.parse(msg, "JIOPAY", 0)).toBeNull();
  });

  // ── merchant: Jio recharge (with phone number) ────────────────────────────

  it("extracts Jio recharge merchant with masked phone number", () => {
    const msg =
      "Plan Name : 249.00 activated for Jio Number : 9876543210. Recharge successful. Transaction ID : BR000CAUBYON";
    const r = parser.parse(msg, "JA-JIOPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe("Jio Recharge - 9876****");
  });

  it('returns "Jio Recharge" when Jio Number in message but no 10-digit number found', () => {
    const msg =
      "Recharge successful for Jio Number : XXXXX. Rs. 149.00. Transaction ID : BR000NOPHON";
    const r = parser.parse(msg, "JA-JIOPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe("Jio Recharge");
  });

  // ── merchant: bill payment ────────────────────────────────────────────────

  // Kotlin isTransactionMessage only adds "recharge successful"; "bill payment successful"
  // is not in Kotlin — all bill-payment messages below return null from parse().
  it("returns null for electricity bill payment message (not recognised by Kotlin)", () => {
    const msg = "Electricity bill payment successful. Rs. 1500.00. Transaction ID : BR000ELEC01";
    expect(parser.parse(msg, "JA-JIOPAY-S", 0)).toBeNull();
  });

  it("returns null for water bill payment message", () => {
    const msg = "Water bill payment successful. Rs. 300.00. Transaction ID : BR000WATR01";
    expect(parser.parse(msg, "JA-JIOPAY-S", 0)).toBeNull();
  });

  it("returns null for gas bill payment message", () => {
    const msg = "Gas bill payment successful. Rs. 800.00. Transaction ID : BR000GAS001";
    expect(parser.parse(msg, "JA-JIOPAY-S", 0)).toBeNull();
  });

  it("returns null for broadband bill payment message", () => {
    const msg = "Broadband bill payment successful. Rs. 999.00. Transaction ID : BR000BROAD1";
    expect(parser.parse(msg, "JIOPAY", 0)).toBeNull();
  });

  it("returns null for DTH bill payment message", () => {
    const msg = "DTH bill payment successful. Rs. 450.00. Transaction ID : BR000DTH001";
    expect(parser.parse(msg, "JA-JIOPAY-S", 0)).toBeNull();
  });

  it("returns null for generic bill payment message", () => {
    const msg = "Bill payment successful. Rs. 500.00. Transaction ID : BR000BILL01";
    expect(parser.parse(msg, "JA-JIOPAY-S", 0)).toBeNull();
  });

  // ── merchant: recharge (non-Jio) ─────────────────────────────────────────

  it('returns "Mobile Recharge" for mobile recharge', () => {
    const msg = "Mobile recharge successful. Rs. 199.00. Transaction ID : BR000MOB001";
    const r = parser.parse(msg, "JA-JIOPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe("Mobile Recharge");
  });

  it('returns "DTH Recharge" for DTH recharge', () => {
    const msg = "DTH recharge successful. Rs. 350.00. Transaction ID : BR000DTH002";
    const r = parser.parse(msg, "JIOPAY", 0);
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe("DTH Recharge");
  });

  it('returns "Data Recharge" for data recharge', () => {
    const msg = "Data recharge successful. Rs. 98.00. Transaction ID : BR000DAT001";
    const r = parser.parse(msg, "JA-JIOPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe("Data Recharge");
  });

  it('returns "Recharge" for generic recharge (no sub-type keyword)', () => {
    const msg = "Recharge successful. Rs. 100.00. Transaction ID : BR000RCH001";
    const r = parser.parse(msg, "JM-JIOPAY", 0);
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe("Recharge");
  });

  // ── merchant: payment successful to ──────────────────────────────────────

  // "payment successful" is not recognised by Kotlin isTransactionMessage; parse() → null.
  it('returns null for "payment successful to" message (not recognised by Kotlin)', () => {
    const msg = "Payment successful to Swiggy for Rs. 350.00. Transaction ID : BR000SWG001";
    expect(parser.parse(msg, "JA-JIOPAY-S", 0)).toBeNull();
  });

  it("returns null for multi-word merchant payment-successful message", () => {
    const msg = "Payment successful to Big Bazaar for Rs. 1500.00. Transaction ID : BR000BB0001";
    expect(parser.parse(msg, "JIOPAY", 0)).toBeNull();
  });

  it('returns null for bare "payment successful to" message', () => {
    const msg = "Payment successful to. Rs. 100.00. Transaction ID : BR000PAY001";
    expect(parser.parse(msg, "JA-JIOPAY-S", 0)).toBeNull();
  });

  // ── reference extraction ──────────────────────────────────────────────────

  it("extracts alphanumeric Transaction ID", () => {
    const msg =
      "Plan Name : 249.00 activated for Jio Number : 9876543210. Recharge successful. Transaction ID : BR000CAUBYON";
    const r = parser.parse(msg, "JA-JIOPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.reference).toBe("BR000CAUBYON");
  });

  // "payment successful" not recognised → null; use a recharge message to test numeric ref
  it("extracts numeric-only Transaction ID from recharge message", () => {
    const msg = "Recharge successful. Rs. 100.00. Transaction ID : 123456789";
    const r = parser.parse(msg, "JIOPAY", 0);
    expect(r).not.toBeNull();
    expect(r!.reference).toBe("123456789");
  });

  it("falls back to base reference extraction when no Transaction ID present", () => {
    // Use "Ref:" format which the base GENERIC_REF pattern handles correctly
    const msg = "Payment credited Rs. 100.00. Ref: 987654321";
    const r = parser.parse(msg, "JA-JIOPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.reference).toBe("987654321");
  });

  // ── isTransactionMessage ──────────────────────────────────────────────────

  it('recognises "recharge successful" as a transaction message', () => {
    const msg =
      "Plan Name : 249.00 activated for Jio Number : 9876543210. Recharge successful. Transaction ID : BR000CAUBYON";
    expect(parser.parse(msg, "JA-JIOPAY-S", 0)).not.toBeNull();
  });

  // Kotlin does NOT add "payment successful" to isTransactionMessage; parse() → null.
  it('does not recognise bare "payment successful" as a transaction message', () => {
    const msg = "Payment successful to Amazon for Rs. 999.00. Transaction ID : BR000AMZ001";
    expect(parser.parse(msg, "JA-JIOPAY-S", 0)).toBeNull();
  });

  it("does not parse OTP messages", () => {
    const msg = "Your JioPay OTP is 123456. Valid for 10 minutes. Do not share.";
    expect(parser.parse(msg, "JA-JIOPAY-S", 0)).toBeNull();
  });

  it("does not parse promotional/offer messages", () => {
    const msg = "Exclusive offer! Get cashback offer on your JioPay wallet. T&C apply.";
    expect(parser.parse(msg, "JIOPAY", 0)).toBeNull();
  });

  it("does not parse payment request messages", () => {
    const msg = "user@upi has requested Rs. 500.00 from your JioPay wallet.";
    expect(parser.parse(msg, "JA-JIOPAY-S", 0)).toBeNull();
  });

  // ── bankName and currency ─────────────────────────────────────────────────

  it("sets correct bankName and currency on parsed result", () => {
    const msg =
      "Plan Name : 249.00 activated for Jio Number : 9876543210. Recharge successful. Transaction ID : BR000CAUBYON";
    const r = parser.parse(msg, "JA-JIOPAY-S", 0);
    expect(r).not.toBeNull();
    expect(r!.bankName).toBe("JioPay");
    expect(r!.currency).toBe("INR");
  });
});
