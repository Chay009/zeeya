import { describe, it, expect } from "vitest";
import { ICICIBankParser } from "../banks/icici.js";

const parser = new ICICIBankParser();

describe("ICICIBankParser", () => {
  it("returns correct bank name", () => {
    expect(parser.getBankName()).toBe("ICICI Bank");
  });

  it("returns INR currency", () => {
    expect(parser.getCurrency()).toBe("INR");
  });

  describe("canHandle", () => {
    it("handles ICICI senders", () => {
      expect(parser.canHandle("AX-ICICIT-S")).toBe(true);
      expect(parser.canHandle("JM-ICICIT-S")).toBe(true);
      expect(parser.canHandle("VM-ICICIT-S")).toBe(true);
      expect(parser.canHandle("ICICIB")).toBe(true);
      expect(parser.canHandle("ICICIBANK")).toBe(true);
    });

    it("rejects unrelated senders", () => {
      expect(parser.canHandle("HDFC")).toBe(false);
    });
  });

  it("parses USD card purchase", () => {
    const r = parser.parse(
      "USD 11.80 spent using ICICI Bank Card XX7004 on 03-Sep-25 on 1xJetBrains AI . Avl Limit: INR 17,95,899.53. If not you, call 1800 2662/SMS BLOCK 7004 to 9215676766.",
      "JM-ICICIT-S",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(11.8);
    expect(r!.currency).toBe("USD");
    expect(r!.type).toBe("CREDIT");
    expect(r!.merchant).toBe("1xJetBrains AI");
    expect(r!.accountLast4).toBe("7004");
  });

  it("parses EUR card purchase", () => {
    const r = parser.parse(
      "EUR 50.00 spent using ICICI Bank Card XX1234 on 05-Sep-25 on Amazon DE. Avl Limit: INR 2,00,000.00. SMS BLOCK 1234 to 9215676766",
      "JM-ICICIT-S",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(50);
    expect(r!.currency).toBe("EUR");
    expect(r!.type).toBe("CREDIT");
    expect(r!.merchant).toBe("Amazon DE");
    expect(r!.accountLast4).toBe("1234");
  });

  it("parses INR card purchase", () => {
    const r = parser.parse(
      "INR 500.00 spent using ICICI Bank Card XX5678 on 06-Sep-25 on Swiggy. Avl Limit: INR 1,50,000.00.",
      "JM-ICICIT-S",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("CREDIT");
    expect(r!.merchant).toBe("Swiggy");
    expect(r!.accountLast4).toBe("5678");
  });

  it("should not parse future autopay notification", () => {
    expect(
      parser.parse(
        "Your account will be debited with Rs 649.00 on 03-Oct-25 towards Netflix Entertainment Ser for AutoPay MERCHANTMANDATE, RRN 421723106963-ICICI Bank.",
        "AX-ICICIT-S",
        0,
      ),
    ).toBeNull();
  });

  it("parses actual autopay debit", () => {
    const r = parser.parse(
      "Your account has been debited with Rs 649.00 towards Netflix Entertainment Ser for AutoPay MERCHANTMANDATE. RRN 421723106963. Avl Bal Rs 10,000.00-ICICI Bank",
      "AX-ICICIT-S",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(649);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("Netflix Entertainment Ser");
    expect(r!.balance).toBe(10000);
    expect(r!.reference).toBe("421723106963");
  });

  it("should not parse future debit variations", () => {
    expect(
      parser.parse(
        "Rs. 500.00 will be debited from your account on 05-Oct-25 for EMI payment",
        "AX-ICICIT-S",
        0,
      ),
    ).toBeNull();
    expect(
      parser.parse(
        "Your ICICI Bank Account will be debited with Rs 1,000.00 on 10-Oct-25",
        "AX-ICICIT-S",
        0,
      ),
    ).toBeNull();
    expect(
      parser.parse(
        "AutoPay: Rs 299.00 will be debited on 15-Oct-25 for Spotify subscription",
        "AX-ICICIT-S",
        0,
      ),
    ).toBeNull();
  });

  it("should not parse credit card bill payment received", () => {
    expect(
      parser.parse(
        "Payment of Rs 26,266.00 has been received on your ICICI Bank Credit Card XX9006 through Bharat Bill Payment System on 06-DEC-25.",
        "AD-ICICIT-S",
        0,
      ),
    ).toBeNull();
  });

  it("parses regular debit with UPI reference", () => {
    const r = parser.parse(
      "ICICI Bank Acct XX123 debited for Rs 500.00 on 01-Oct-25; merchant credited. UPI: 543210987654. Call 18002662 for dispute. Updated Bal: Rs 5,000.00",
      "AX-ICICIT-S",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.accountLast4).toBe("123");
    expect(r!.reference).toBe("543210987654");
    expect(r!.balance).toBe(5000);
  });

  it("parses salary credit with INF format", () => {
    const r = parser.parse(
      "ICICI Bank Account XX566 credited:Rs. 18,832.00 on 28-Feb-25. Info INF*000169831922*IQBO SAL FE. Available Balance is Rs. 28,076.14.",
      "VM-ICICIT",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(18832);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("INCOME");
    expect(r!.merchant).toBe("Salary");
    expect(r!.accountLast4).toBe("566");
    expect(r!.balance).toBe(28076.14);
  });

  it("parses UPI debit with merchant credited pattern", () => {
    const r = parser.parse(
      "ICICI Bank Acct XX051 debited for Rs 180.00 on 10-Nov-25; DINDUGAL ORIGIN credited. UPI:568069174081. Call 18002662 for dispute. SMS BLOCK 051 to 9215676766. 06:33 PM",
      "ICICIB",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(180);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("DINDUGAL ORIGIN");
    expect(r!.reference).toBe("568069174081");
    expect(r!.accountLast4).toBe("051");
  });
});
