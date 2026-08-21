import { describe, it, expect } from "vitest";
import { MalanaEngine } from "./malana.js";
import { seedData } from "./index.js";
import { CurrencyRegistry } from "./currency-registry.js";
import {
  extractRawMerchant as extractRawMerchantWithRegistry,
  extractMerchantWithAnchors as extractMerchantWithAnchorsAndRegistry,
  compileAnchors,
  AnchorRulesSchema,
  isValidMerchantCandidate as isValidMerchantCandidateWithRegistry,
} from "./merchant-extractor.js";

const engine = new MalanaEngine(seedData);
const currencyRegistry = new CurrencyRegistry(seedData);

function extractRawMerchant(message: string, bankName?: string | null): string | null {
  return extractRawMerchantWithRegistry(message, currencyRegistry, bankName);
}

function extractMerchantWithAnchors(
  message: string,
  anchors: Parameters<typeof extractMerchantWithAnchorsAndRegistry>[1],
  bankName?: string | null,
): string | null {
  return extractMerchantWithAnchorsAndRegistry(message, anchors, currencyRegistry, bankName);
}

function isValidMerchantCandidate(candidate: string): boolean {
  return isValidMerchantCandidateWithRegistry(candidate, currencyRegistry);
}

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

  it("real UPI debit to ZERODHA BROKING — anchor recovers the correct merchant", () => {
    const msg =
      "Dear UPI user A/C X1434 debited by 999.00 on date 15Jul26 trf to ZERODHA BROKING Refno 046545973198 If not u? call-1800111109 for other services-18001234-SBI";
    const r = engine.parse(msg, "VM-SBIUPI");
    expect(r.vendor).toBe("ZERODHA BROKING");
  });

  // Real garbled label (task #7): "avoid as per T&C ignore" was shown as a
  // merchant name. Traced to root cause: every word in that phrase tokenizes
  // as a real Truecaller keyword (AVOID/AS/PER/PREMOREINFOURL/IGNORE), not
  // free text — the legacy token-based #vendor capture can only ever grab
  // recognized dictionary vocabulary, never a genuine merchant name, so it
  // was removed as a fallback entirely (see merchant-extractor.ts's header
  // comment). No anchor matches this message shape (it's a payment
  // reminder, not "X trf to Y"), so vendor must be null now, not garbage.
  it("HDFC overdraft reminder — no anchor matches, vendor is null instead of the disclaimer text", () => {
    const msg =
      "Long Overdue Alert:\nYour HDFC Bank CSA Overdraft A/c xxxxxxxx4317 is still overdue.Pay Rs.300 today to avoid action as per T&C.\nignore if paid.";
    const r = engine.parse(msg, "VM-HDFCBK");
    expect(r.vendor).toBeNull();
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

  // A prior pass rejected "avoid as per T&C Ignore" via a growable
  // boilerplate-substring denylist. Removed deliberately: disclaimer
  // phrasing is open-ended, so a denylist of specific strings never
  // converges. Only bounded, enumerable categories are checked now — see
  // the file-header comment in merchant-extractor.ts for why.

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

describe("extractRawMerchant — word boundaries (deliberate deviation from Cashiro)", () => {
  // Cashiro's own anchors have no \b before to/from/at/for, so "to" can
  // match mid-word. Confirmed as a real false positive, not theoretical:
  // this exact case returned "Grocery" before word boundaries were added.
  it('does not match "to" inside "Photo"', () => {
    expect(extractRawMerchant("Photo Grocery Ref 123")).toBeNull();
  });

  it('still matches a real standalone "to"', () => {
    const msg = "Dear UPI user A/C X1234 debited by 50.00 trf to shopname Refno 123456789012";
    expect(extractRawMerchant(msg)).toBe("shopname");
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

describe("bank-scoped anchors — mechanism only, no real production rules yet", () => {
  // Synthetic rules, not merchant-patterns.json entries: proves the
  // bank-scoping wiring itself (priority order, bankName matching) without
  // adding invented bank-specific patterns to the shared, evidence-only
  // rule file. merchant-patterns.json stays empty of "banks" entries until
  // a real garbled label from a specific bank demonstrates the generic
  // Cashiro anchors miss it.
  const anchors = compileAnchors([
    { id: "generic_to", before: "to\\s+", after: "(?:\\s+on|\\s+Ref)" },
    {
      id: "hdfc_paid_towards",
      before: "paid\\s+towards\\s+",
      after: "\\s+on",
      banks: ["HDFC Bank"],
    },
  ]);

  it("tries a matching bank-scoped anchor before the generic one", () => {
    const msg = "You paid towards Local Grocer on 15-08-26.";
    // The generic "to" anchor doesn't match this message shape at all, so
    // this alone doesn't prove priority order — see the next test for that.
    expect(extractMerchantWithAnchors(msg, anchors, "HDFC Bank")).toBe("Local Grocer");
  });

  it("skips a bank-scoped anchor when bankName doesn't match, falling through to the generic one", () => {
    const msg = "You paid towards Local Grocer on 15-08-26.";
    expect(extractMerchantWithAnchors(msg, anchors, "ICICI Bank")).toBeNull();
    expect(extractMerchantWithAnchors(msg, anchors, null)).toBeNull();
  });

  it("prefers the bank-scoped match over a generic anchor that would also match", () => {
    const bothMatch = compileAnchors([
      { id: "generic_to", before: "to\\s+", after: "(?:\\s+on|\\s+Ref)" },
      { id: "hdfc_to", before: "to\\s+", after: "\\s+Ref", banks: ["HDFC Bank"] },
    ]);
    const msg = "You paid to Real Merchant Ref 12345 on 15-08-26.";
    // Both anchors can match this message; the bank-scoped one must win
    // when the bank matches, since it's tried first (Cashiro's own
    // subclass-before-base-class order).
    expect(extractMerchantWithAnchors(msg, bothMatch, "HDFC Bank")).toBe("Real Merchant");
  });

  it("merchant-patterns.json itself has no bank-scoped rules yet (evidence-first)", async () => {
    const raw = (await import("./data/merchant-patterns.json")).default as Array<{
      banks?: string[];
    }>;
    expect(raw.every((rule) => !rule.banks)).toBe(true);
  });
});

describe("AnchorRulesSchema — validates merchant-patterns.json at load time", () => {
  it("accepts a well-formed rule set", () => {
    expect(
      AnchorRulesSchema.safeParse([{ id: "x", before: "to\\s+", after: "\\s+on" }]).success,
    ).toBe(true);
  });

  it("rejects an empty before/after (would compile a no-op or broken regex silently)", () => {
    expect(AnchorRulesSchema.safeParse([{ id: "x", before: "", after: "\\s+on" }]).success).toBe(
      false,
    );
    expect(AnchorRulesSchema.safeParse([{ id: "x", before: "to\\s+", after: "" }]).success).toBe(
      false,
    );
  });

  it("rejects a missing id", () => {
    expect(AnchorRulesSchema.safeParse([{ before: "to\\s+", after: "\\s+on" }]).success).toBe(
      false,
    );
  });

  it("rejects duplicate anchor ids", () => {
    const rules = [
      { id: "dup", before: "to\\s+", after: "\\s+on" },
      { id: "dup", before: "from\\s+", after: "\\s+on" },
    ];
    expect(AnchorRulesSchema.safeParse(rules).success).toBe(false);
  });

  it("rejects an empty rule set (would silently disable merchant extraction)", () => {
    expect(AnchorRulesSchema.safeParse([]).success).toBe(false);
  });

  it("still throws (via compileAnchors' regex compile) on a structurally invalid regex fragment", () => {
    const rules = AnchorRulesSchema.parse([{ id: "bad", before: "(", after: "\\s+on" }]);
    expect(() => compileAnchors(rules)).toThrow(/invalid anchor "bad"/);
  });
});
