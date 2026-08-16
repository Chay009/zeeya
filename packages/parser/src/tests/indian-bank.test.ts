import { describe, it, expect } from "vitest";
import { IndianBankParser } from "../banks/indian-bank.js";

const parser = new IndianBankParser();

describe("IndianBankParser", () => {
  // ── canHandle ─────────────────────────────────────────────────────────────

  it("handles known senders", () => {
    expect(parser.canHandle("BV-INDBNK-S")).toBe(true);
    expect(parser.canHandle("AD-INDBNK-S")).toBe(true);
    expect(parser.canHandle("AX-INDBNK-S")).toBe(true);
    expect(parser.canHandle("INDBNK")).toBe(true);
    expect(parser.canHandle("INDIAN")).toBe(true);
    expect(parser.canHandle("XX-INDBNK-T")).toBe(true); // OTP messages
    expect(parser.canHandle("AB-INDBNK-P")).toBe(true); // Promotional messages
    expect(parser.canHandle("UNKNOWN")).toBe(false);
    expect(parser.canHandle("HDFC")).toBe(false);
    expect(parser.canHandle("SBI")).toBe(false);
  });

  // ── getBankName ───────────────────────────────────────────────────────────

  it("returns correct bank name", () => {
    expect(parser.getBankName()).toBe("Indian Bank");
  });

  // ── UPI credit transaction with VPA ───────────────────────────────────────

  it("parses UPI credit transaction with VPA", () => {
    const msg =
      "Rs.2.00 credited to a/c *8175 on 07/10/2025 by a/c linked to VPA poweraccess.paytm3@axisbank (UPI Ref no 981408452805).Indian Bank";
    const r = parser.parse(msg, "BV-INDBNK-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2.0);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("INCOME");
    expect(r!.accountLast4).toBe("8175");
    expect(r!.merchant).toBe("poweraccess.paytm3");
    expect(r!.reference).toBe("981408452805");
    expect(r!.bankName).toBe("Indian Bank");
  });

  // ── ATM withdrawal ────────────────────────────────────────────────────────

  it("parses ATM withdrawal", () => {
    const msg = "Rs. 2000 withdrawn from ATM at MAIN STREET BRANCH on 09/10/2025.Indian Bank";
    const r = parser.parse(msg, "INDBNK", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2000);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("ATM - MAIN STREET BRANCH");
    expect(r!.bankName).toBe("Indian Bank");
  });

  // ── Cash deposit ──────────────────────────────────────────────────────────

  it("parses cash deposit", () => {
    const msg = "Rs. 5000.00 deposited to a/c *8175 on 10/10/2025.Indian Bank";
    const r = parser.parse(msg, "INDBNK", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(5000.0);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("INCOME");
    expect(r!.accountLast4).toBe("8175");
    expect(r!.bankName).toBe("Indian Bank");
  });

  // ── Large UPI credit with VPA ─────────────────────────────────────────────

  it("parses large UPI credit with VPA", () => {
    const msg =
      "Rs.15000.00 credited to a/c *1234 on 11/10/2025 by a/c linked to VPA customer@paytm (UPI Ref no 555444333222).Indian Bank";
    const r = parser.parse(msg, "BV-INDBNK-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(15000.0);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("INCOME");
    expect(r!.accountLast4).toBe("1234");
    expect(r!.merchant).toBe("customer");
    expect(r!.reference).toBe("555444333222");
  });

  // ── Small amount credit ───────────────────────────────────────────────────

  it("parses small amount credit", () => {
    const msg =
      "Rs.1.50 credited to a/c *5678 on 12/10/2025 by a/c linked to VPA reward@gpay (UPI Ref no 111222333444).Indian Bank";
    const r = parser.parse(msg, "BV-INDBNK-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1.5);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("INCOME");
    expect(r!.accountLast4).toBe("5678");
    expect(r!.merchant).toBe("reward");
    expect(r!.reference).toBe("111222333444");
  });

  // ── Alternative sender pattern ────────────────────────────────────────────

  it("parses credit with alternative sender INDIAN", () => {
    const msg = "Rs.100.00 credited to a/c *9012 on 13/10/2025.Indian Bank";
    const r = parser.parse(msg, "INDIAN", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(100.0);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("INCOME");
    expect(r!.accountLast4).toBe("9012");
  });

  // ── Factory test cases (transaction parsing) ──────────────────────────────

  it("parses UPI credit (factory test case 1)", () => {
    const msg =
      "Rs.2.00 credited to a/c *8175 on 07/10/2025 by a/c linked to VPA poweraccess.paytm3@axisbank (UPI Ref no 981408452805).Indian Bank";
    const r = parser.parse(msg, "BV-INDBNK-S", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2.0);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("INCOME");
    expect(r!.accountLast4).toBe("8175");
    expect(r!.merchant).toBe("poweraccess.paytm3");
    expect(r!.reference).toBe("981408452805");
  });

  it("parses deposit (factory test case 2)", () => {
    const msg = "Rs. 1000.00 deposited to a/c *5678 on 01/01/2025.Indian Bank";
    const r = parser.parse(msg, "INDBNK", 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1000.0);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("INCOME");
    expect(r!.accountLast4).toBe("5678");
  });
});
