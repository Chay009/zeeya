import { describe, it, expect } from "vitest";
import { YesBankParser } from "../banks/yes.js";

const parser = new YesBankParser();

describe("YesBankParser", () => {
  it("returns correct bank name", () => {
    expect(parser.getBankName()).toBe("Yes Bank");
  });

  it("returns INR currency", () => {
    expect(parser.getCurrency()).toBe("INR");
  });

  describe("canHandle", () => {
    it("handles Yes Bank senders", () => {
      expect(parser.canHandle("CP-YESBNK-S")).toBe(true);
      expect(parser.canHandle("VM-YESBNK-S")).toBe(true);
      expect(parser.canHandle("JX-YESBNK-S")).toBe(true);
      expect(parser.canHandle("YESBANK")).toBe(true);
    });

    it("rejects unrelated senders", () => {
      expect(parser.canHandle("UNKNOWN")).toBe(false);
    });
  });

  it("parses C N S FUEL PORT credit card spend", () => {
    const r = parser.parse(
      "INR 404.36 spent on YES BANK Card X3349 @UPI_C N S FUEL PORT 24-08-2025 06:17:25 pm. Avl Lmt INR 211,476.24. SMS BLKCC 3349 to 9840909000 if not you",
      "CP-YESBNK-S",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(404.36);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("CREDIT");
    expect(r!.merchant).toBe("C N S FUEL PORT");
    expect(r!.accountLast4).toBe("3349");
    expect(r!.creditLimit).toBe(211476.24);
    expect(r!.isFromCard).toBe(true);
  });

  it("parses S B ENTERPRISES credit card spend", () => {
    const r = parser.parse(
      "INR 56.00 spent on YES BANK Card X3349 @UPI_S B ENTERPRISES 24-08-2025 06:03:40 am. Avl Lmt INR 211,880.60. SMS BLKCC 3349 to 9840909000 if not you",
      "VM-YESBNK-S",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(56);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("CREDIT");
    expect(r!.merchant).toBe("S B ENTERPRISES");
    expect(r!.accountLast4).toBe("3349");
    expect(r!.creditLimit).toBe(211880.6);
    expect(r!.isFromCard).toBe(true);
  });

  it("parses MOHAMMED AKRAM credit card spend", () => {
    const r = parser.parse(
      "INR 24.00 spent on YES BANK Card X3349 @UPI_MOHAMMED AKRAM 23-08-2025 11:51:19 am. Avl Lmt INR 212,012.60. SMS BLKCC 3349 to 9840909000 if not you",
      "JX-YESBNK-S",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(24);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("CREDIT");
    expect(r!.merchant).toBe("MOHAMMED AKRAM");
    expect(r!.accountLast4).toBe("3349");
    expect(r!.creditLimit).toBe(212012.6);
    expect(r!.isFromCard).toBe(true);
  });

  it("parses SURAKSHAA HEALTHCA credit card spend", () => {
    const r = parser.parse(
      "INR 250.00 spent on YES BANK Card X3349 @UPI_SURAKSHAA HEALTHCA 23-08-2025 10:02:59 am. Avl Lmt INR 212,036.60. SMS BLKCC 3349 to 9840909000 if not you",
      "CP-YESBNK-S",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(250);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("CREDIT");
    expect(r!.merchant).toBe("SURAKSHAA HEALTHCA");
    expect(r!.accountLast4).toBe("3349");
    expect(r!.creditLimit).toBe(212036.6);
    expect(r!.isFromCard).toBe(true);
  });

  it("should not parse OTP message", () => {
    expect(
      parser.parse(
        "Dear Customer, your OTP for login is 123456. Do not share with anyone. -Yes Bank",
        "CP-YESBNK-S",
        0,
      ),
    ).toBeNull();
  });

  it("should not parse promotional offer message", () => {
    expect(
      parser.parse(
        "Get exciting offers on Yes Bank Credit Cards. Apply now! Visit yesbank.in",
        "CP-YESBNK-S",
        0,
      ),
    ).toBeNull();
  });

  it("should not parse payment request message", () => {
    expect(
      parser.parse(
        "Payment request of INR 500.00 from merchant@upi. Ignore if already paid.",
        "CP-YESBNK-S",
        0,
      ),
    ).toBeNull();
  });

  it("should not parse payment due reminder", () => {
    expect(
      parser.parse(
        "Your Yes Bank Credit Card payment of INR 10,000 is due by 25-08-2025",
        "CP-YESBNK-S",
        0,
      ),
    ).toBeNull();
  });
});
