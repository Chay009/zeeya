import { describe, it, expect } from "vitest";
import { NaviMutualFundParser } from "../banks/navi-mutual-fund.js";

const parser = new NaviMutualFundParser();

describe("NaviMutualFundParser", () => {
  it("returns correct bank name", () => {
    expect(parser.getBankName()).toBe("Navi Mutual Fund");
  });

  it("returns INR currency", () => {
    expect(parser.getCurrency()).toBe("INR");
  });

  describe("canHandle", () => {
    it("handles senders containing NAVI", () => {
      expect(parser.canHandle("NAVIMF")).toBe(true);
      expect(parser.canHandle("NAVI")).toBe(true);
      expect(parser.canHandle("NAVIAPP")).toBe(true);
      expect(parser.canHandle("navi")).toBe(true);
    });

    it("rejects senders not containing NAVI", () => {
      expect(parser.canHandle("HDFCBK")).toBe(false);
      expect(parser.canHandle("SBIMF")).toBe(false);
      expect(parser.canHandle("UNKNOWN")).toBe(false);
    });
  });

  it("parses Navi Mutual Fund debit transaction", () => {
    const r = parser.parse(
      "INR 1000.00 debited towards Navi Mutual Fund SIP. Ref: NAVI123456",
      "NAVIMF",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1000);
    expect(r!.type).toBe("EXPENSE");
    expect(r!.currency).toBe("INR");
    expect(r!.bankName).toBe("Navi Mutual Fund");
  });

  it("parses Navi Mutual Fund credit transaction", () => {
    const r = parser.parse(
      "INR 2500.00 credited from Navi Mutual Fund redemption. Ref: NAVI789012",
      "NAVIMF",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2500);
    expect(r!.type).toBe("INCOME");
    expect(r!.currency).toBe("INR");
    expect(r!.bankName).toBe("Navi Mutual Fund");
  });
});
