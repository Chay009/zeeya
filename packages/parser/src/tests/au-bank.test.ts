import { describe, it, expect } from "vitest";
import { AUBankParser } from "../banks/au-bank.js";

const parser = new AUBankParser();

describe("AUBankParser", () => {
  describe("canHandle", () => {
    it("handles AUBANK", () => expect(parser.canHandle("AUBANK")).toBe(true));
    it("handles JK-AUBANK", () => expect(parser.canHandle("JK-AUBANK")).toBe(true));
    it("handles AD-AUBANK", () => expect(parser.canHandle("AD-AUBANK")).toBe(true));
    it("handles AD-AUBANK-S", () => expect(parser.canHandle("AD-AUBANK-S")).toBe(true));
    it("handles lowercase aubank", () => expect(parser.canHandle("aubank")).toBe(true));
    it("rejects HDFCBK", () => expect(parser.canHandle("HDFCBK")).toBe(false));
    it("rejects AUSFIN", () => expect(parser.canHandle("AUSFIN")).toBe(false));
    it("rejects AUBNK", () => expect(parser.canHandle("AUBNK")).toBe(false));
    it("rejects empty string", () => expect(parser.canHandle("")).toBe(false));
  });

  it("returns correct bank name", () => {
    expect(parser.getBankName()).toBe("AU Small Finance Bank");
  });

  describe("UPI credit (Credited INR X to A/c)", () => {
    const message =
      "Credited INR 500.00 to A/c XXXXX1234 on 01-01-2025 Ref UPI/CR/123456789012/JOHN DOE JOHN DOE(user@upi). Bal INR 1,500.00";
    const result = parser.parse(message, "AD-AUBANK", 0);

    it("parses successfully", () => expect(result).not.toBeNull());
    it("amount is 500", () => expect(result?.amount).toBe(500));
    it("type is INCOME", () => expect(result?.type).toBe("INCOME"));
    it("accountLast4 is 1234", () => expect(result?.accountLast4).toBe("1234"));
    it("balance is 1500", () => expect(result?.balance).toBe(1500));
    it("bankName is AU Small Finance Bank", () =>
      expect(result?.bankName).toBe("AU Small Finance Bank"));
  });

  describe("UPI debit (Debited INR X from A/c)", () => {
    const message =
      "Debited INR 1,000.00 from A/c XXXXX5678 on 15-01-2025 Ref UPI/DR/987654321012/MERCHANT. Bal INR 3,000.00";
    const result = parser.parse(message, "JK-AUBANK", 0);

    it("parses successfully", () => expect(result).not.toBeNull());
    it("amount is 1000", () => expect(result?.amount).toBe(1000));
    it("type is EXPENSE", () => expect(result?.type).toBe("EXPENSE"));
    it("accountLast4 is 5678", () => expect(result?.accountLast4).toBe("5678"));
    it("balance is 3000", () => expect(result?.balance).toBe(3000));
  });

  describe("ATM withdrawal", () => {
    const message =
      "withdrawn INR 2,000.00 from A/c XXXXX9012 on 20-01-2025 at ATM. Bal INR 8,000.00";
    const result = parser.parse(message, "AUBANK", 0);

    it("parses successfully", () => expect(result).not.toBeNull());
    it("amount is 2000", () => expect(result?.amount).toBe(2000));
    it("type is EXPENSE", () => expect(result?.type).toBe("EXPENSE"));
    it("merchant is ATM Withdrawal", () => expect(result?.merchant).toBe("ATM Withdrawal"));
  });

  describe("OTP message is rejected", () => {
    it("returns null", () => {
      expect(parser.parse("Your AU Bank OTP is 123456. Do not share.", "AD-AUBANK", 0)).toBeNull();
    });
  });
});
