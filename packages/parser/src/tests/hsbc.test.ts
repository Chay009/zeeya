import { describe, it, expect } from "vitest";
import { HSBCBankParser } from "../banks/hsbc.js";

const parser = new HSBCBankParser();

describe("HSBCBankParser", () => {
  describe("canHandle", () => {
    it("handles HSBC sender", () => {
      expect(parser.canHandle("HSBC")).toBe(true);
    });

    it("handles HSBCIN sender", () => {
      expect(parser.canHandle("HSBCIN")).toBe(true);
    });

    it("handles DLT pattern AX-HSBC-S", () => {
      expect(parser.canHandle("AX-HSBC-S")).toBe(true);
    });

    it("handles DLT pattern JD-HSBCIN-T", () => {
      expect(parser.canHandle("JD-HSBCIN-T")).toBe(true);
    });

    it("does not handle HDFC", () => {
      expect(parser.canHandle("HDFC")).toBe(false);
    });

    it("does not handle UNKNOWN", () => {
      expect(parser.canHandle("UNKNOWN")).toBe(false);
    });
  });

  describe("getBankName", () => {
    it("returns HSBC Bank", () => {
      expect(parser.getBankName()).toBe("HSBC Bank");
    });
  });

  describe("NEFT Credit with UTR - Format A/c 074-260***-006", () => {
    const message =
      "HSBC: A/c 074-260***-006 is credited with INR 5000.00 on 27NOV at 06.33.02 with UTR CHASH00007392391 as NEFT from CHAS A/c ***6983 of John Doe . Your Avl Bal is INR 15000.50.";
    const sender = "HSBC";
    const result = parser.parse(message, sender, 1700000000000);

    it("parses amount", () => {
      expect(result?.amount).toBe(5000.0);
    });

    it("parses type as INCOME", () => {
      expect(result?.type).toBe("INCOME");
    });

    it("parses merchant", () => {
      expect(result?.merchant).toBe("CHAS A/c ***6983 of John Doe");
    });

    it("parses accountLast4", () => {
      expect(result?.accountLast4).toBe("0006");
    });

    it("parses balance", () => {
      expect(result?.balance).toBe(15000.5);
    });

    it("parses reference", () => {
      expect(result?.reference).toBe("CHASH00007392391");
    });

    it("parses currency as INR", () => {
      expect(result?.currency).toBe("INR");
    });
  });

  describe("NEFT Credit with UTR - Different account format", () => {
    const message =
      "HSBC: A/c 123-456***-789 is credited with INR 2500.75 on 15DEC at 10.15.30 with UTR NEFT12345678901 as NEFT from AXIS A/c ***1234 of Jane Smith . Your Avl Bal is INR 50000.00.";
    const sender = "HSBC";
    const result = parser.parse(message, sender, 1700000000000);

    it("parses amount", () => {
      expect(result?.amount).toBe(2500.75);
    });

    it("parses type as INCOME", () => {
      expect(result?.type).toBe("INCOME");
    });

    it("parses merchant", () => {
      expect(result?.merchant).toBe("AXIS A/c ***1234 of Jane Smith");
    });

    it("parses accountLast4", () => {
      expect(result?.accountLast4).toBe("0789");
    });

    it("parses balance", () => {
      expect(result?.balance).toBe(50000.0);
    });

    it("parses reference", () => {
      expect(result?.reference).toBe("NEFT12345678901");
    });
  });

  describe("Debit Card Purchase", () => {
    const message =
      "Thank you for using HSBC Debit Card XXXXX71xx at IKEA INDIA . for INR 49.00 on 12-04-25.";
    const sender = "HSBC";
    const result = parser.parse(message, sender, 1700000000000);

    it("parses amount", () => {
      expect(result?.amount).toBe(49.0);
    });

    it("parses type as EXPENSE", () => {
      expect(result?.type).toBe("EXPENSE");
    });

    it("parses merchant", () => {
      expect(result?.merchant).toBe("IKEA INDIA");
    });

    it("parses accountLast4", () => {
      expect(result?.accountLast4).toBe("71xx");
    });

    it("parses currency as INR", () => {
      expect(result?.currency).toBe("INR");
    });
  });

  describe("Credit Card Purchase", () => {
    const message = "Your HSBC creditcard xxxxx1234 used at AMAZON for INR 305.00 on 15-04-25.";
    const sender = "HSBC";
    const result = parser.parse(message, sender, 1700000000000);

    it("parses amount", () => {
      expect(result?.amount).toBe(305.0);
    });

    it("parses type as CREDIT", () => {
      expect(result?.type).toBe("CREDIT");
    });

    it("parses merchant", () => {
      expect(result?.merchant).toBe("AMAZON");
    });

    it("parses accountLast4", () => {
      expect(result?.accountLast4).toBe("1234");
    });
  });

  describe("Payment Transaction", () => {
    const message =
      "HSBC: INR 1000.50 is paid from account XXXXXX4567 to ELECTRICITY BOARD on 20APR with ref 222222222222. Your available bal is INR 8000.00.";
    const sender = "HSBC";
    const result = parser.parse(message, sender, 1700000000000);

    it("parses amount", () => {
      expect(result?.amount).toBe(1000.5);
    });

    it("parses type as EXPENSE", () => {
      expect(result?.type).toBe("EXPENSE");
    });

    it("parses merchant", () => {
      expect(result?.merchant).toBe("ELECTRICITY BOARD");
    });

    it("parses accountLast4", () => {
      expect(result?.accountLast4).toBe("4567");
    });

    it("parses balance", () => {
      expect(result?.balance).toBe(8000.0);
    });

    it("parses reference", () => {
      expect(result?.reference).toBe("222222222222");
    });
  });

  describe("OTP message filtering", () => {
    it("returns null for OTP messages", () => {
      const result = parser.parse(
        "Your HSBC OTP is 123456. Valid for 10 minutes.",
        "HSBC",
        1700000000000,
      );
      expect(result).toBeNull();
    });
  });
});
