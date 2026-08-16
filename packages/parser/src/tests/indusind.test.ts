import { describe, it, expect } from "vitest";
import { IndusIndBankParser } from "../banks/indusind.js";

const parser = new IndusIndBankParser();

describe("IndusIndBankParser", () => {
  it("returns correct bank name", () => {
    expect(parser.getBankName()).toBe("IndusInd Bank");
  });

  it("returns INR currency", () => {
    expect(parser.getCurrency()).toBe("INR");
  });

  describe("canHandle", () => {
    it("handles IndusInd senders", () => {
      expect(parser.canHandle("AD-INDUSB-S")).toBe(true);
      expect(parser.canHandle("VM-INDUSB-T")).toBe(true);
      expect(parser.canHandle("VM-INDUSIND-S")).toBe(true);
      expect(parser.canHandle("JK-INDUSB-S")).toBe(true);
      expect(parser.canHandle("JX-INDUSB-S")).toBe(true);
      expect(parser.canHandle("JD-INDUSB-S")).toBe(true);
      expect(parser.canHandle("JM-INDUSB-S")).toBe(true);
      expect(parser.canHandle("INDUSB")).toBe(true);
      expect(parser.canHandle("INDUSIND")).toBe(true);
    });

    it("rejects unrelated senders", () => {
      expect(parser.canHandle("AX-HDFC-S")).toBe(false);
    });
  });

  it("parses debit with merchant and balance", () => {
    const r = parser.parse(
      "Rs. 1,234.00 debited from A/c XX1234 at ZOMATO Ref 998877. Avl Bal: Rs 10,000.00",
      "VM-INDUSB-S",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1234);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("ZOMATO");
    expect(r!.accountLast4).toBe("1234");
    expect(r!.balance).toBe(10000);
    expect(r!.reference).toBe("998877");
  });

  it("parses UPI debit with RRN and VPA", () => {
    const r = parser.parse(
      "A/c *XX1234 debited by Rs 1234.00 towards xxxx.yyyy@icici. RRN: 510048508040. Not You? call 18602677777- IndusInd Bank.",
      "AD-INDUSIND-S",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1234);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("xxxx.yyyy");
    expect(r!.accountLast4).toBe("1234");
    expect(r!.reference).toBe("510048508040");
  });

  it("parses UPI credit with RRN and VPA", () => {
    const r = parser.parse(
      "A/C *XX1234 credited by Rs 25000.00 from xxxx.yyyy@ybl. RRN:510048508040. Avl Bal:105502.12. Not you? Call 18602677777 - IndusInd bank.",
      "AD-INDUSIND-S",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(25000);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("INCOME");
    expect(r!.merchant).toBe("xxxx.yyyy");
    expect(r!.accountLast4).toBe("1234");
    expect(r!.reference).toBe("510048508040");
    expect(r!.balance).toBe(105502.12);
  });

  it("should not parse deposit interest message", () => {
    expect(
      parser.parse(
        "Net interest INR 248.07 paid on your IndusInd Deposit No 300***123456 on 17/09/25. Call 18602677777 for assistance - IndusInd Bank",
        "AD-INDUSIND-S",
        0,
      ),
    ).toBeNull();
  });

  it("parses IMPS debit", () => {
    const r = parser.parse(
      "Your IndusInd Account 20XXXXX1234 has been debited for INR 6440 towards IMPS/12345678901. Call 18602677777 to report issue-IndusInd Bank.",
      "AD-INDUSIND-S",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(6440);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("IMPS");
    expect(r!.accountLast4).toBe("1234");
  });

  it("should not parse balance-only message", () => {
    expect(
      parser.parse(
        "Your A/C 2134***12345 has Avl BAL of INR 1,234.56 as on 05/10/25 04:10 AM. Download IndusMobile from PlayStore - IndusInd Bank",
        "AD-INDUSIND-S",
        0,
      ),
    ).toBeNull();
  });

  it("parses ACH debit with trailing balance", () => {
    const r = parser.parse(
      "IndusInd A/C  Debited; INR 4,500.00 Ref-ACH DR INW PAY/0000WD2CEFDT2Z58B2202320321456/Grow.Bal INR 141,999.93.Dispute-Call 18602677777-IndusInd Bank.",
      "AD-INDUSIND-S",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(4500);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("Grow");
    expect(r!.balance).toBe(141999.93);
    expect(r!.isFromCard).toBe(false);
    expect(r!.accountLast4).toBeNull();
  });

  it("parses debit card purchase with masked account", () => {
    const r = parser.parse(
      "INR 1,101.53 debited from your A/C 201***123456 towards Debit Card Purchase. Avl BAL INR 400.20 - Not you? Call 18602677777 to report issue - IndusInd Bank.",
      "AD-INDUSIND-S",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1101.53);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.accountLast4).toBe("3456");
    expect(r!.balance).toBe(400.2);
    expect(r!.isFromCard).toBe(false);
  });

  it("parses IMPS credit with from account/merchant pattern", () => {
    const r = parser.parse(
      "Your account XXXXXXX1234 is credited by Rs.54321 on 07-11-25 received from account XXXXXXX4321/MADMONEY (IMPS Ref no. 123456789). Call 18602677777 to report issue-IndusInd Bank",
      "VM-INDUSB-T",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(54321);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("INCOME");
    expect(r!.merchant).toBe("MADMONEY");
    expect(r!.accountLast4).toBe("1234");
    expect(r!.reference).toBe("123456789");
  });
});
