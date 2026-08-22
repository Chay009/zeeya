import { describe, expect, it } from "vitest";
import { createMalanaEngine } from "./index";
import { parsePersistedMalanaResult, MalanaResultSchema } from "./result-schema";

const engine = createMalanaEngine();

describe("parsePersistedMalanaResult", () => {
  it("accepts a real result from a genuine bank transaction message", () => {
    const msg = "INR 5,000.00 debited from account XX1234 on 09-08-2026. Avail Bal: INR 12,500.00";
    const real = engine.parse(msg, "VM-HDFCBK");
    const roundTripped = JSON.parse(JSON.stringify(real));
    expect(parsePersistedMalanaResult(roundTripped)).not.toBeNull();
  });

  it("accepts a real result from a travel message (exercises optional/category-specific fields)", () => {
    const msg = "Your flight AI202 from DEL to BOM departs at 14:30. PNR ABC123.";
    const real = engine.parse(msg, "AIRINDIA");
    const roundTripped = JSON.parse(JSON.stringify(real));
    expect(parsePersistedMalanaResult(roundTripped)).not.toBeNull();
  });

  it("accepts a real result with no recognized category (mostly-null fields)", () => {
    const real = engine.parse("just a random text message with no transaction content", "UNKNOWN");
    const roundTripped = JSON.parse(JSON.stringify(real));
    expect(parsePersistedMalanaResult(roundTripped)).not.toBeNull();
  });

  it("rejects null", () => {
    expect(parsePersistedMalanaResult(null)).toBeNull();
  });

  it("rejects a value with the right top-level shape but wrong field types", () => {
    // The exact case that slipped past a shallow "is an object with a
    // category key" check: ref as a number instead of a string.
    const real = engine.parse("test", "SENDER");
    const corrupted = { ...JSON.parse(JSON.stringify(real)), ref: 3 };
    expect(parsePersistedMalanaResult(corrupted)).toBeNull();
  });

  it("rejects a value missing required fields", () => {
    expect(parsePersistedMalanaResult({ category: "GRM_BANK" })).toBeNull();
  });
});

describe("MalanaResultSchema", () => {
  it("round-trips every message in a small real-message sample without loss", () => {
    const messages: [string, string][] = [
      [
        "INR 5,000.00 debited from account XX1234 on 09-08-2026. Avail Bal: INR 12,500.00",
        "VM-HDFCBK",
      ],
      ["Your OTP is 456789. Valid for 10 minutes.", "VM-HDFCBK"],
      ["Your order #OD987654 from Flipkart is out for delivery today.", "FKORDER"],
    ];
    for (const [msg, sender] of messages) {
      const real = engine.parse(msg, sender);
      const roundTripped = JSON.parse(JSON.stringify(real));
      const parsed = MalanaResultSchema.parse(roundTripped);
      expect(parsed).toEqual(roundTripped);
    }
  });
});
