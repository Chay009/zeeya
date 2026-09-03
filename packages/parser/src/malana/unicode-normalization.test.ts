import { describe, expect, it } from "vitest";
import { normalizeSmsForParsing, seedData } from "./index.js";
import { MalanaEngine } from "./malana.js";

const engine = new MalanaEngine(seedData);

describe("Malana Unicode normalization", () => {
  it("is idempotent and preserves ordinary multilingual financial text", () => {
    const ordinary = "₹1,250 जमा हुआ — తెలుగు SMS";
    expect(normalizeSmsForParsing(ordinary)).toBe(ordinary);
    expect(normalizeSmsForParsing(normalizeSmsForParsing("𝖽𝖾𝖻𝗂𝗍𝖾𝖽"))).toBe("debited");
  });

  it("parses transaction keywords written with mathematical Unicode letters", () => {
    const result = engine.parse(
      "𝖸𝗈𝗎𝗋 a/c XXXXXXXXXXXX4626  𝗂𝗌 𝖽𝖾𝖻𝗂𝗍𝖾𝖽  Rs. 13224.00  𝗈𝗇  09-Aug-2026  𝗍𝗈  GOPISETTY  VENKATA LAKSHMI  𝗂𝗇𝖿𝗈  :P2A/815344312335. Avl Bal INR 3061.25  𝖭𝗈𝗍 𝖸𝗈𝗎? 𝖼𝖺𝗅𝗅 18005721916- 𝖪𝖵𝖡",
    );

    expect(result.category).toBe("GRM_BANK");
    expect(result.trx).toBe("13224.00");
    expect(result.trxType).toBe("debit");
    expect(result.trxTypeRich).toBe("EXPENSE");
    expect(result.acc).toBe("XXXXXXXXXXXX4626");
    expect(result.bal).toBe("3061.25");
    expect(result.currency).toBe("INR");
  });
});
