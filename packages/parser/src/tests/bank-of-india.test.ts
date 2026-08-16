import { describe, it, expect } from "vitest";
import { BankOfIndiaParser } from "../banks/bank-of-india.js";

const parser = new BankOfIndiaParser();

describe("BankOfIndiaParser", () => {
  describe("canHandle", () => {
    it.each([
      ["JM-BOIIND-S", true],
      ["JD-BOIIND-S", true],
      ["BK-BOIIND-S", true],
      ["BOIIND", true],
      ["BOIBNK", true],
      ["HDFC", false],
      ["SBI", false],
      ["", false],
    ])("canHandle(%s) === %s", (sender, expected) => {
      expect(parser.canHandle(sender)).toBe(expected);
    });
  });

  describe("parse", () => {
    it("Cash Deposit via Cash Acceptor Machine", () => {
      const result = parser.parse(
        "BOI -  Cash Rs. 500 deposited in your account XX5468 from Cash Acceptor Machine R0807030 at  MAIN TRIMBAK ROAD ON 14-10-2025. Available balance Rs. 20100.81",
        "JM-BOIIND-S",
        1000000,
      );
      expect(result).not.toBeNull();
      expect(result!.amount).toBe(500);
      expect(result!.currency).toBe("INR");
      expect(result!.type).toBe("INCOME");
      expect(result!.merchant).toBe("Cash Deposit");
      expect(result!.accountLast4).toBe("5468");
      expect(result!.balance).toBe(20100.81);
    });

    it("Cash Deposit at MAIN ROAD", () => {
      const result = parser.parse(
        "BOI -  Cash Rs. 500 deposited in your account XX5468 from Cash Acceptor Machine R0807030 at  MAIN ROAD ON 14-10-2025. Available balance Rs. 15000.50",
        "BOIIND",
        1000000,
      );
      expect(result).not.toBeNull();
      expect(result!.amount).toBe(500);
      expect(result!.currency).toBe("INR");
      expect(result!.type).toBe("INCOME");
      expect(result!.merchant).toBe("Cash Deposit");
      expect(result!.accountLast4).toBe("5468");
      expect(result!.balance).toBe(15000.5);
    });

    it("UPI Debit Transaction", () => {
      const result = parser.parse(
        "Rs.200.00 debited A/cXX5468 and credited to SAI MISAL via UPI Ref No 315439383341 on 23Aug25. Call 18001031906, if not done by you. -BOI",
        "JM-BOIIND-S",
        1000000,
      );
      expect(result).not.toBeNull();
      expect(result!.amount).toBe(200);
      expect(result!.currency).toBe("INR");
      expect(result!.type).toBe("EXPENSE");
      expect(result!.merchant).toBe("SAI MISAL");
      expect(result!.accountLast4).toBe("5468");
      expect(result!.reference).toBe("315439383341");
    });
  });
});
