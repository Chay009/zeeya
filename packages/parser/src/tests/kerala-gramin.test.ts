import { describe, it, expect } from "vitest";
import { KeralaGraminBankParser } from "../banks/kerala-gramin.js";

const parser = new KeralaGraminBankParser();

describe("KeralaGraminBankParser", () => {
  describe("canHandle", () => {
    it("handles AD-KGBANK-S", () => {
      expect(parser.canHandle("AD-KGBANK-S")).toBe(true);
    });
    it("handles BX-KGBANK-S", () => {
      expect(parser.canHandle("BX-KGBANK-S")).toBe(true);
    });
    it("handles KGBANK", () => {
      expect(parser.canHandle("KGBANK")).toBe(true);
    });
    it("handles kgbank (lowercase)", () => {
      expect(parser.canHandle("kgbank")).toBe(true);
    });
    it("rejects HDFC", () => {
      expect(parser.canHandle("HDFC")).toBe(false);
    });
    it("rejects SBI", () => {
      expect(parser.canHandle("SBI")).toBe(false);
    });
    it("rejects empty string", () => {
      expect(parser.canHandle("")).toBe(false);
    });
  });

  describe("UPI Debit Transfer", () => {
    const message =
      "Your a/c no. XXXX12345 is debited for Rs.160.00 on 28/7/25 05:06 PM and credited to a/c no. XXXXX00019 (UPI Ref no 170632692557)-Kerala Gramin Bank";
    const sender = "AD-KGBANK-S";
    const result = parser.parse(message, sender, 0);

    it("parses successfully", () => {
      expect(result).not.toBeNull();
    });
    it("amount is 160.00", () => {
      expect(result?.amount).toBe(160.0);
    });
    it("currency is INR", () => {
      expect(result?.currency).toBe("INR");
    });
    it("type is EXPENSE", () => {
      expect(result?.type).toBe("EXPENSE");
    });
    it("merchant is UPI Transfer", () => {
      expect(result?.merchant).toBe("UPI Transfer");
    });
    it("accountLast4 is 2345", () => {
      expect(result?.accountLast4).toBe("2345");
    });
    it("reference is 170632692557", () => {
      expect(result?.reference).toBe("170632692557");
    });
  });

  describe("UPI Credit from Phone", () => {
    const message =
      "Dear Customer, Account XXXX123 is credited with INR 3000 on 20-10-2025 08:15:26 from 7025784485@upi. UPI Ref. no. 529807237409-Kerala Gramin Bank";
    const sender = "BX-KGBANK-S";
    const result = parser.parse(message, sender, 0);

    it("parses successfully", () => {
      expect(result).not.toBeNull();
    });
    it("amount is 3000", () => {
      expect(result?.amount).toBe(3000);
    });
    it("currency is INR", () => {
      expect(result?.currency).toBe("INR");
    });
    it("type is INCOME", () => {
      expect(result?.type).toBe("INCOME");
    });
    it("merchant is UPI Payment", () => {
      expect(result?.merchant).toBe("UPI Payment");
    });
    it("accountLast4 is 0123", () => {
      expect(result?.accountLast4).toBe("0123");
    });
    it("reference is 529807237409", () => {
      expect(result?.reference).toBe("529807237409");
    });
  });

  describe("UPI Credit from UPI ID", () => {
    const message =
      "Dear Customer, Account XXXX5678 is credited with INR 500 on 15-10-2025 10:30:00 from merchant@paytm. UPI Ref. no. 123456789012-Kerala Gramin Bank";
    const sender = "AD-KGBANK-S";
    const result = parser.parse(message, sender, 0);

    it("parses successfully", () => {
      expect(result).not.toBeNull();
    });
    it("amount is 500", () => {
      expect(result?.amount).toBe(500);
    });
    it("currency is INR", () => {
      expect(result?.currency).toBe("INR");
    });
    it("type is INCOME", () => {
      expect(result?.type).toBe("INCOME");
    });
    it("merchant is merchant", () => {
      expect(result?.merchant).toBe("merchant");
    });
    it("accountLast4 is 5678", () => {
      expect(result?.accountLast4).toBe("5678");
    });
    it("reference is 123456789012", () => {
      expect(result?.reference).toBe("123456789012");
    });
  });

  describe("Larger UPI Debit", () => {
    const message =
      "Your a/c no. XXXX9876 is debited for Rs.1,250.50 on 01/8/25 03:15 PM and credited to a/c no. XXXXX11111 (UPI Ref no 987654321098)-Kerala Gramin Bank";
    const sender = "BX-KGBANK-S";
    const result = parser.parse(message, sender, 0);

    it("parses successfully", () => {
      expect(result).not.toBeNull();
    });
    it("amount is 1250.50", () => {
      expect(result?.amount).toBe(1250.5);
    });
    it("currency is INR", () => {
      expect(result?.currency).toBe("INR");
    });
    it("type is EXPENSE", () => {
      expect(result?.type).toBe("EXPENSE");
    });
    it("merchant is UPI Transfer", () => {
      expect(result?.merchant).toBe("UPI Transfer");
    });
    it("accountLast4 is 9876", () => {
      expect(result?.accountLast4).toBe("9876");
    });
    it("reference is 987654321098", () => {
      expect(result?.reference).toBe("987654321098");
    });
  });
});
