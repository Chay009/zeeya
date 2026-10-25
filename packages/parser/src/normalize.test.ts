import { describe, expect, it } from "vitest";

import { parseAmount, parseDecimalAmount } from "./normalize.js";

describe("parseDecimalAmount", () => {
  it("reads Western and Indian grouping as the amount that was written", () => {
    expect(parseDecimalAmount("5,000.00")).toBe(5000);
    expect(parseDecimalAmount("1,00,000.50")).toBe(100000.5);
    expect(parseDecimalAmount("-12.34")).toBe(-12.34);
    expect(parseDecimalAmount("0")).toBe(0);
  });

  it("rejects a comma pattern that is neither grouping style", () => {
    expect(parseDecimalAmount("1,23.00")).toBeNull();
    expect(parseDecimalAmount("1,,2.00")).toBeNull();
    expect(parseDecimalAmount("not a number")).toBeNull();
    expect(parseDecimalAmount(null)).toBeNull();
  });

  it("keeps parseAmount limited to positive amounts", () => {
    expect(parseAmount("1,234.50")).toBe(1234.5);
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
  });
});
