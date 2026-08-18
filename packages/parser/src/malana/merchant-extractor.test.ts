import { describe, it, expect } from "vitest";
import { MalanaEngine } from "./malana.js";
import { seedData } from "./index.js";
import {
  extractRawMerchant,
  isValidMerchantCandidate,
  extractLegacyMerchant,
} from "./merchant-extractor.js";

const engine = new MalanaEngine(seedData);

describe("extractRawMerchant — anchor extraction on real message shapes", () => {
  it('"trf to X Refno" — recovers the real merchant the token stream never saw', () => {
    const msg =
      "Dear UPI user A/C X1234 debited by 50.00 on date 15Aug26 trf to shopname Refno 123456789012";
    expect(extractRawMerchant(msg)).toBe("shopname");
  });

  it("returns null when no anchor matches", () => {
    expect(extractRawMerchant("Your OTP is 456789. Valid for 10 minutes.")).toBeNull();
  });

  it("bounded capture: does not swallow the rest of a long message", () => {
    const long = "trf to " + "x".repeat(500) + " Refno 12345";
    const result = extractRawMerchant(long);
    expect(result === null || result.length <= 300).toBe(true);
  });
});

describe("MalanaEngine.parse() — vendor field uses the raw anchor over the garbled token capture", () => {
  it('real "trf to X Refno" message', () => {
    const msg =
      "Dear UPI user A/C X1234 debited by 50.00 on date 15Aug26 trf to shopname Refno 123456789012";
    const r = engine.parse(msg, "VM-SBIUPI");
    expect(r.vendor).toBe("shopname");
  });
});

describe("isValidMerchantCandidate — rejection gate", () => {
  it("rejects blank / too short (Cashiro's MIN_MERCHANT_NAME_LENGTH = 2)", () => {
    expect(isValidMerchantCandidate("")).toBe(false);
    expect(isValidMerchantCandidate("a")).toBe(false);
  });

  it("accepts short real merchant names", () => {
    expect(isValidMerchantCandidate("1mg")).toBe(true);
    expect(isValidMerchantCandidate("H&M")).toBe(true);
    expect(isValidMerchantCandidate("7-Eleven")).toBe(true);
    expect(isValidMerchantCandidate("99acres")).toBe(true);
    expect(isValidMerchantCandidate("MCDONALDS-1234")).toBe(true);
    expect(isValidMerchantCandidate("DMart Ready")).toBe(true);
    expect(isValidMerchantCandidate("CRED")).toBe(true);
  });

  it("rejects a pure number", () => {
    expect(isValidMerchantCandidate("123456789012")).toBe(false);
  });

  it("rejects a date the tokenizer recognizes, even without separators", () => {
    expect(isValidMerchantCandidate("15Aug26")).toBe(false);
    expect(isValidMerchantCandidate("15-Aug-2026")).toBe(false);
  });

  it("rejects an amount", () => {
    expect(isValidMerchantCandidate("50.00")).toBe(false);
  });

  it("rejects a masked account number", () => {
    expect(isValidMerchantCandidate("XX1234")).toBe(false);
    expect(isValidMerchantCandidate("X1234")).toBe(false);
  });

  it("rejects a VPA", () => {
    expect(isValidMerchantCandidate("foo@oksbi")).toBe(false);
  });

  it("rejects exact structural words (Cashiro's commonWords list)", () => {
    for (const word of [
      "to",
      "from",
      "using",
      "via",
      "by",
      "with",
      "for",
      "at",
      "the",
      "through",
    ]) {
      expect(isValidMerchantCandidate(word)).toBe(false);
    }
  });

  it("does not reject a real name merely containing a structural word", () => {
    expect(isValidMerchantCandidate("To The Moon Cafe")).toBe(true);
  });

  it("rejects the confirmed real boilerplate phrase", () => {
    expect(isValidMerchantCandidate("avoid as per T&C Ignore")).toBe(false);
  });

  it("rejects punctuation-only noise", () => {
    expect(isValidMerchantCandidate("...")).toBe(false);
  });
});

describe("extractRawMerchant — Cashiro-mirrored anchors (generic to/from/at/for)", () => {
  it('"from X on" recovers the merchant via FROM_PATTERN', () => {
    // No "to" substring anywhere earlier in the message — TO_PATTERN is
    // tried first (ALL_PATTERNS order) and must not spuriously match first.
    const msg = "Rs.500 credited from Ramesh Kumar on 15-08-26.";
    expect(extractRawMerchant(msg)).toBe("Ramesh Kumar");
  });

  it('"for X on" recovers the merchant via FOR_PATTERN', () => {
    const msg = "Payment of Rs.500 for Bata Shoes on 15-08-26 was successful.";
    expect(extractRawMerchant(msg)).toBe("Bata Shoes");
  });

  it('"at X on" recovers the merchant via AT_PATTERN', () => {
    const msg = "You spent Rs.500 at Cafe Coffee Day on 15-08-26.";
    expect(extractRawMerchant(msg)).toBe("Cafe Coffee Day");
  });
});

describe("cleanMerchantName behavior (via extractRawMerchant) — mirrors Cashiro's cleanMerchantName", () => {
  it("strips a trailing parenthetical", () => {
    const msg = "You paid Rs.100 to Local Store (Branch 2) on 15-08-26.";
    expect(extractRawMerchant(msg)).toBe("Local Store");
  });

  it('strips a "PVT LTD" suffix', () => {
    const msg = "You paid Rs.100 to Some Company Pvt Ltd on 15-08-26.";
    expect(extractRawMerchant(msg)).toBe("Some Company");
  });

  it('strips a "LIMITED" suffix', () => {
    const msg = "You paid Rs.100 to Acme Industries Limited on 15-08-26.";
    expect(extractRawMerchant(msg)).toBe("Acme Industries");
  });

  it("strips a trailing dash", () => {
    const msg = "You paid Rs.100 to Roadside Stall - on 15-08-26.";
    expect(extractRawMerchant(msg)).toBe("Roadside Stall");
  });
});

describe("isValidMerchantName / isValidMerchantCandidate — mirrors Cashiro's isValidMerchantName", () => {
  it("rejects a commonWords entry exactly (case-insensitive)", () => {
    expect(isValidMerchantCandidate("USING")).toBe(false);
    expect(isValidMerchantCandidate("using")).toBe(false);
  });

  it("rejects a no-letter candidate even when it isn't purely digits", () => {
    expect(isValidMerchantCandidate("12-34")).toBe(false);
  });
});

describe("extractLegacyMerchant — same validation gate applied to the token-based capture", () => {
  it("rejects a null/empty candidate", () => {
    expect(extractLegacyMerchant(null)).toBeNull();
    expect(extractLegacyMerchant("")).toBeNull();
  });

  it("rejects a date-shaped legacy capture", () => {
    expect(extractLegacyMerchant("15aug26")).toBeNull();
  });

  it("passes through and normalizes a valid legacy capture", () => {
    expect(extractLegacyMerchant("  Swiggy  ")).toBe("Swiggy");
  });
});
