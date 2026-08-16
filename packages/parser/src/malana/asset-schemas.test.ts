/**
 * Runtime schema/version validation for the Truecaller-extracted seed assets.
 * parseSeedData/parseCategorizerData replace the previous unsafe `as unknown
 * as X` casts — these tests prove the validation actually rejects bad input,
 * not just that it accepts good input.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { parseSeedData, parseCategorizerData } from "./asset-schemas.js";

const realSeed = JSON.parse(readFileSync("./src/malana/data/seeddata.json", "utf8"));
const realCategorizer = JSON.parse(readFileSync("./src/malana/data/categorizer.json", "utf8"));

function minimalValidSeed(overrides: Record<string, unknown> = {}) {
  return {
    REPOVERSION: "1.0.72",
    VERSION: "1.1.36",
    COUNTRY: "IN",
    TOKENS: { SAL: "dear,hi,hello" },
    CLASSIFIER: { CLS_ID: ["PNR", "ORDERID"] },
    GRAMMAR: {
      GRM_BANK: { GRMR: [{ "BAL[bal]": "BLNC AMT" }], STRUCT: [], PATTERN: [] },
    },
    ...overrides,
  };
}

function minimalValidCategorizer(overrides: Record<string, unknown> = {}) {
  return {
    probabilities: [{ word: "debited", probability: [0.001, 0.0001, 100, 5, 2.3, 2.3] }],
    meta: [0.5, 0.5, 1000, 2000, 100, 200, 300, 400, 50, 60],
    version: 17,
    ...overrides,
  };
}

describe("parseSeedData", () => {
  it("accepts the real bundled seeddata.json", () => {
    expect(() => parseSeedData(realSeed)).not.toThrow();
  });

  it("accepts a minimal well-formed seed", () => {
    expect(() => parseSeedData(minimalValidSeed())).not.toThrow();
  });

  it("rejects a seed missing required fields", () => {
    const { TOKENS: _TOKENS, ...withoutTokens } = minimalValidSeed();
    expect(() => parseSeedData(withoutTokens)).toThrow();
  });

  it("rejects an unsupported REPOVERSION", () => {
    expect(() => parseSeedData(minimalValidSeed({ REPOVERSION: "9.9.9" }))).toThrow(/REPOVERSION/);
  });

  it("rejects an unsupported VERSION", () => {
    expect(() => parseSeedData(minimalValidSeed({ VERSION: "0.0.1" }))).toThrow(/VERSION/);
  });

  it("rejects a non-India COUNTRY", () => {
    expect(() => parseSeedData(minimalValidSeed({ COUNTRY: "US" }))).toThrow(/COUNTRY/);
  });

  it("rejects a malformed GRAMMAR shape", () => {
    expect(() =>
      parseSeedData(minimalValidSeed({ GRAMMAR: { GRM_BANK: { GRMR: "not-an-array" } } })),
    ).toThrow();
  });
});

describe("parseCategorizerData", () => {
  it("accepts the real bundled categorizer.json", () => {
    expect(() => parseCategorizerData(realCategorizer)).not.toThrow();
  });

  it("accepts a minimal well-formed categorizer", () => {
    expect(() => parseCategorizerData(minimalValidCategorizer())).not.toThrow();
  });

  it("preserves all 6 probability values and all 10 meta values, not just the used ones", () => {
    const parsed = parseCategorizerData(minimalValidCategorizer());
    expect(parsed.probabilities[0]!.probability).toHaveLength(6);
    expect(parsed.meta).toHaveLength(10);
  });

  it("rejects a malformed probability tuple (wrong length)", () => {
    expect(() =>
      parseCategorizerData(
        minimalValidCategorizer({ probabilities: [{ word: "x", probability: [0.1, 0.2] }] }),
      ),
    ).toThrow();
  });

  it("rejects a malformed probability tuple (non-numeric entry)", () => {
    expect(() =>
      parseCategorizerData(
        minimalValidCategorizer({
          probabilities: [{ word: "x", probability: [0.1, 0.2, 1, 2, "oops", 2.3] }],
        }),
      ),
    ).toThrow();
  });

  it("rejects a meta array of the wrong length", () => {
    expect(() => parseCategorizerData(minimalValidCategorizer({ meta: [0.5, 0.5] }))).toThrow();
  });

  it("rejects an unsupported version", () => {
    expect(() => parseCategorizerData(minimalValidCategorizer({ version: 1 }))).toThrow(/version/);
  });
});
