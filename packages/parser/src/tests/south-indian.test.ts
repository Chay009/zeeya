import { describe, it, expect } from "vitest";
import { SouthIndianBankParser } from "../banks/south-indian.js";

const parser = new SouthIndianBankParser();

describe("SouthIndianBankParser", () => {
  // canHandle checks (from Kotlin handleChecks list)
  it("handles known and unknown senders", () => {
    expect(parser.canHandle("SIBSMS")).toBe(true);
    expect(parser.canHandle("AD-SIBSMS")).toBe(true);
    expect(parser.canHandle("CP-SIBSMS")).toBe(true);
    expect(parser.canHandle("AD-SIBSMS-S")).toBe(true);
    expect(parser.canHandle("SIBBANK")).toBe(true);
    expect(parser.canHandle("VM-SIBSMS-S")).toBe(true); // via contains('SIBSMS')
    expect(parser.canHandle("AX-HDFC-S")).toBe(false);
  });

  // Verbatim test cases from SouthIndianBankParserTest.kt

  it("parses IMPS credit with reference", () => {
    const r = parser.parse(
      "Dear Customer, Your A/c X7377 is credited with Rs.792.02 Info: IMPS/FDRL/528005821348/EPIFI ACCOUN. Final balance is Rs.793.02-South Indian Bank",
      "SIBSMS",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(792.02);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("INCOME");
    expect(r!.merchant).toBe("EPIFI ACCOUN");
    expect(r!.accountLast4).toBe("7377");
    expect(r!.balance).toBe(793.02);
    expect(r!.reference).toBe("528005821348");
  });

  it("parses UPI debit with RRN and balance", () => {
    const r = parser.parse(
      "UPI debit:Rs.599.00 A/c X7477, 16-10-25 16:25:29 RRN: 565526068910 Bal:Rs.12345.89 Block A/c? Call18004251809/SMS BLK<A/c>to 9840777222-South Indian Bank",
      "SIBSMS",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(599.0);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("UPI Transaction");
    expect(r!.accountLast4).toBe("7477");
    expect(r!.balance).toBe(12345.89);
    expect(r!.reference).toBe("565526068910");
  });

  it("parses debit card usage", () => {
    const r = parser.parse(
      "A/c X7477 DEBIT:Rs.983.75 SPICE KITCHEN MCT Bal:Rs.1234.67 Block A/c? call 18004251809/SMS BLK<full A/c>to 9840777222-South Indian Bank",
      "VM-SIBSMS-S",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(983.75);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("SPICE KITCHEN MCT");
    expect(r!.accountLast4).toBe("7477");
    expect(r!.balance).toBe(1234.67);
    expect(r!.reference).toBeNull();
  });

  it("parses UPI debit with comma separator and RRN", () => {
    const r = parser.parse(
      "UPI debit:Rs.42225.06, A/c X7477, 03-11-25 00:12:50 RRN:567304295699. Bal:Rs.35037.21 Block A/c? Cal118004251809/SMS BLK<A/c>to 9840777222-South Indian Bank",
      "SIBSMS",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(42225.06);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("UPI Transaction");
    expect(r!.accountLast4).toBe("7477");
    expect(r!.balance).toBe(35037.21);
    expect(r!.reference).toBe("567304295699");
  });
});
