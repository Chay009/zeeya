import { describe, it, expect } from "vitest";
import { UCOBankParser } from "../banks/uco.js";

const parser = new UCOBankParser();

describe("UCOBankParser", () => {
  it("handles known senders", () => {
    expect(parser.canHandle("AD-UCOBNK")).toBe(true);
    expect(parser.canHandle("JK-UCOBKS")).toBe(true);
    expect(parser.canHandle("UCOBANK")).toBe(true);
    expect(parser.canHandle("HDFCBK")).toBe(false);
  });

  it("returns correct bank name", () => {
    expect(parser.getBankName()).toBe("UCO Bank");
  });

  it("parses debit SMS", () => {
    const r = parser.parse(
      "Dear Customer, Rs.500.00 has been debited from your UCO Bank A/c No. XXXXXXXX1234 on 01-01-2025. Balance: Rs.1000.00",
      "AD-UCOBNK",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500.0);
    expect(r!.type).toBe("EXPENSE");
    expect(r!.accountLast4).toBe("1234");
    expect(r!.balance).toBe(1000.0);
    expect(r!.bankName).toBe("UCO Bank");
  });

  it("parses credit SMS", () => {
    const r = parser.parse(
      "Rs.1,000.00 credited to your UCO Bank a/c XXXX5678 on 01/01/2025. Avl Bal: Rs.5,000.00",
      "JK-UCOBKS",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1000.0);
    expect(r!.type).toBe("INCOME");
    expect(r!.accountLast4).toBe("5678");
    expect(r!.balance).toBe(5000.0);
  });

  it("parses NEFT debit with reference", () => {
    const r = parser.parse(
      "Your UCO Bank a/c XXXX1234 is debited by Rs.250.00 on 15-Jan-2025 through NEFT. Ref No 123456789012. Bal: Rs.750.00",
      "AD-UCOBNK",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(250.0);
    expect(r!.type).toBe("EXPENSE");
    expect(r!.reference).toBe("123456789012");
    expect(r!.balance).toBe(750.0);
  });

  it("filters OTP messages", () => {
    expect(parser.parse("Your UCO Bank OTP is 123456.", "AD-UCOBNK", 0)).toBeNull();
  });
});
