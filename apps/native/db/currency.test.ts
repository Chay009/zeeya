import { describe, expect, it } from "vitest";
import { toMinorUnits, fromMinorUnits, minorUnitExponent } from "./currency";

describe("minorUnitExponent", () => {
  it("returns 2 for standard two-decimal currencies", () => {
    expect(minorUnitExponent("INR")).toBe(2);
    expect(minorUnitExponent("USD")).toBe(2);
  });

  it("returns 0 for zero-decimal currencies", () => {
    expect(minorUnitExponent("JPY")).toBe(0);
    expect(minorUnitExponent("KRW")).toBe(0);
  });

  it("rejects a currency code the parser cannot produce", () => {
    expect(() => minorUnitExponent("XYZ")).toThrow(/Unsupported currency code/);
  });
});

describe("toMinorUnits", () => {
  it("converts a plain 2-decimal amount exactly", () => {
    expect(toMinorUnits("5000.00", "INR")).toBe(500000);
    expect(toMinorUnits("999", "USD")).toBe(99900);
  });

  it("strips thousands separators like dashboard.ts's parseAmount does", () => {
    expect(toMinorUnits("5,000.00", "INR")).toBe(500000);
  });

  it("converts a zero-decimal currency amount exactly", () => {
    expect(toMinorUnits("500", "JPY")).toBe(500);
  });

  it("rejects a zero-decimal currency amount with a fractional part", () => {
    expect(() => toMinorUnits("500.5", "JPY")).toThrow(/more precision/);
  });

  it("rejects excess precision instead of silently rounding (1.005 boundary)", () => {
    // 1.005 has 3 fractional digits for a 2-decimal currency — this is
    // exactly the case where `Math.round(amount * 100)` would have silently
    // produced an imprecise result (1.005 * 100 === 100.49999999999999 in
    // JS floating point); this implementation never reaches that arithmetic
    // at all, it rejects at the string-precision check first.
    expect(() => toMinorUnits("1.005", "INR")).toThrow(/more precision/);
  });

  it("pads a shorter fractional part instead of rejecting it", () => {
    expect(toMinorUnits("5.5", "INR")).toBe(550);
    expect(toMinorUnits("5", "INR")).toBe(500);
  });

  it("preserves sign", () => {
    expect(toMinorUnits("-500.25", "INR")).toBe(-50025);
  });

  it("converts the largest amount this app should ever see without losing precision", () => {
    // A real bank transaction/balance in the tens of crores — nowhere near
    // Number.MAX_SAFE_INTEGER (~9 * 10^15) even in minor units, but this
    // confirms the BigInt path round-trips exactly rather than silently
    // wrapping or losing digits the way float arithmetic could.
    const amount = "99999999.99";
    const minorUnits = toMinorUnits(amount, "INR");
    expect(minorUnits).toBe(9999999999);
    expect(Number.isSafeInteger(minorUnits)).toBe(true);
    expect(fromMinorUnits(minorUnits, "INR")).toBe(99999999.99);
  });

  it("rejects an amount that would overflow Number.MAX_SAFE_INTEGER in minor units", () => {
    // 2^53 / 100, rounded up past the safe-integer boundary once converted
    // to minor units.
    expect(() => toMinorUnits("90071992547409.92", "INR")).toThrow(/safe integer/);
  });

  it("rejects a currency code the parser cannot produce", () => {
    expect(() => toMinorUnits("100.00", "XYZ")).toThrow(/Unsupported currency code/);
  });

  it("rejects non-decimal input", () => {
    expect(() => toMinorUnits("NaN", "INR")).toThrow(/Not a decimal amount/);
    expect(() => toMinorUnits("Infinity", "INR")).toThrow(/Not a decimal amount/);
    expect(() => toMinorUnits("", "INR")).toThrow(/Not a decimal amount/);
    expect(() => toMinorUnits("12.34.56", "INR")).toThrow(/Not a decimal amount/);
  });
});

describe("fromMinorUnits", () => {
  it("round-trips with toMinorUnits", () => {
    expect(fromMinorUnits(toMinorUnits("1234.56", "USD"), "USD")).toBe(1234.56);
  });

  it("round-trips a zero-decimal currency", () => {
    expect(fromMinorUnits(toMinorUnits("500", "JPY"), "JPY")).toBe(500);
  });
});
