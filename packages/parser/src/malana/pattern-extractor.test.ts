import { describe, it, expect } from "vitest";
import { compilePatterns, runPatterns } from "./pattern-extractor.js";
import type { Token } from "./types";

// Regression for the swallowed-capture bug traced via a real message: DATE
// and SAL token types were missing from the structural stop-list, so a
// salutation ("Dear") or a date the tokenizer recognized but DATE_RE's own
// separator-requiring regex didn't (e.g. "15Aug26") got captured as free
// text instead of stopping the capture. See merchant-extractor.ts for the
// actual fix to what gets shown as a merchant name — this file only checks
// that pattern-extractor.ts itself no longer swallows these token types.
function tok(type: string, text: string): Token {
  return { type, raw: text, text, values: {}, locked: false, matched: false, children: [] };
}

describe("pattern-extractor structural stop-list — DATE/DT/SAL", () => {
  const patterns = compilePatterns(["#vendor"]);

  it("does not capture a SAL token as free text", () => {
    const tokens = [tok("SAL", "Dear")];
    const result = runPatterns(patterns, tokens);
    expect(result["vendor"]).toBeUndefined();
  });

  it("does not capture a DATE token as free text, even without separators", () => {
    const tokens = [tok("DATE", "15aug26")];
    const result = runPatterns(patterns, tokens);
    expect(result["vendor"]).toBeUndefined();
  });

  it("does not capture a DT (date-marker) token as free text", () => {
    const tokens = [tok("DT", "date")];
    const result = runPatterns(patterns, tokens);
    expect(result["vendor"]).toBeUndefined();
  });

  it("still captures real free text between a SAL/DATE token and the end", () => {
    const tokens = [tok("SAL", "Dear"), tok("WORD", "Customer")];
    const result = runPatterns(patterns, tokens);
    expect(result["vendor"]).toBe("Customer");
  });
});
