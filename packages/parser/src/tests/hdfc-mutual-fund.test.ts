import { describe, it, expect } from "vitest";
import { HDFCMutualFundParser } from "../banks/hdfc-mutual-fund.js";

const parser = new HDFCMutualFundParser();

describe("HDFCMutualFundParser", () => {
  it("returns correct bank name", () => {
    expect(parser.getBankName()).toBe("HDFC Mutual Fund");
  });

  it("returns INR currency", () => {
    expect(parser.getCurrency()).toBe("INR");
  });

  describe("canHandle", () => {
    it("handles senders containing HDFCMF", () => {
      expect(parser.canHandle("HDFCMF")).toBe(true);
      expect(parser.canHandle("AD-HDFCMF-S")).toBe(true);
    });

    it("rejects senders not containing HDFCMF", () => {
      expect(parser.canHandle("HDFCBK")).toBe(false);
      expect(parser.canHandle("HDFC")).toBe(false);
      expect(parser.canHandle("MF")).toBe(false);
      expect(parser.canHandle("")).toBe(false);
    });
  });

  it("parses SIP purchase transaction", () => {
    const r = parser.parse(
      "Dear Investor, your SIP purchase of Rs.1000.00 under HDFC Flexi Cap Fund for folio 1234567890 has been processed successfully. NAV: Rs.25.50",
      "HDFCMF",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1000);
    expect(r!.type).toBe("INVESTMENT");
    expect(r!.currency).toBe("INR");
    expect(r!.bankName).toBe("HDFC Mutual Fund");
    expect(r!.merchant).toBe("HDFC Flexi Cap Fund");
  });

  it("parses redemption transaction", () => {
    const r = parser.parse(
      "Dear Investor, your redemption of Rs.5000.00 under HDFC Liquid Fund for folio 9876543210 has been processed. Units redeemed.",
      "HDFCMF",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(5000);
    expect(r!.type).toBe("INCOME");
    expect(r!.currency).toBe("INR");
    expect(r!.bankName).toBe("HDFC Mutual Fund");
  });

  it("returns null balance", () => {
    const r = parser.parse(
      "Your SIP purchase of Rs.500.00 under HDFC Mid Cap Opportunities Fund for folio 1111111111 has been processed.",
      "HDFCMF",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.balance).toBeNull();
  });

  it("returns null accountLast4", () => {
    const r = parser.parse(
      "Your SIP purchase of Rs.500.00 under HDFC Top 100 Fund for folio 2222222222 has been processed.",
      "HDFCMF",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.accountLast4).toBeNull();
  });
});
