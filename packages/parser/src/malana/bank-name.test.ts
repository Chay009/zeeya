/**
 * Regression test for the duplicate-bank-card bug: detectBank() must return
 * the exact same string for the same real bank regardless of which layer
 * matched it (bank.json sender-ID match vs vendor_banks.json text/UPI-handle
 * match). See bank-identity.ts's canonical-name resolution — vendor_banks.json
 * resolves its names through bank.json instead of inventing its own casing.
 */
import { describe, it, expect } from "vitest";
import { detectBank, resolveBankIdentity } from "./enrichment.js";
import { createMalanaEngine } from "./index.js";
import vendorBanksRaw from "./data/vendor_banks.json";
import bankSeedRaw from "./data/bank.json";

describe("detectBank — cross-layer name consistency", () => {
  it("resolves an SBI terminal signature for a numeric sender", () => {
    const message = "Rs.50 debited from A/c X1234 -SBI";
    expect(detectBank("+916300000000", message)).toBe("State Bank of India");
    expect(resolveBankIdentity("+916300000000", message)).toEqual({
      bankName: "State Bank of India",
      source: "terminal-signature",
    });
  });

  it("resolves a terminal signature attached to preceding boilerplate", () => {
    expect(
      detectBank(
        "+916300000000",
        "Rs.50 debited from A/c X1234. For other services call-18001234-SBI",
      ),
    ).toBe("State Bank of India");
  });

  it.each([
    ["SBIINB", "State Bank of India"],
    ["HDFCBK", "HDFC Bank"],
    ["ICICIB", "ICICI Bank"],
    ["AXISBK", "Axis Bank"],
    ["KOTAKB", "Kotak Bank"],
    ["PNB", "Punjab National Bank"],
    ["PNBSMS", "Punjab National Bank"],
  ])("resolves the cross-bank terminal signature -%s", (signature, expected) => {
    expect(detectBank("+916300000000", `Transaction alert -${signature}`)).toBe(expected);
  });

  it.each(["ADIDAS", "PVRCIN", "TEST", "SBICRD1234", "OKSBI", "YES", "ICI"])(
    "ignores an unknown terminal signature -%s",
    (signature) => {
      expect(detectBank("+916300000000", `Transaction alert -${signature}`)).toBeNull();
    },
  );

  it("does not treat a beneficiary UPI handle as the source bank", () => {
    expect(detectBank("+916300000000", "Rs.500 paid to customer@oksbi via UPI")).toBeNull();
  });

  it("keeps an authoritative sender match when the body ends with another bank signature", () => {
    expect(detectBank("VM-HDFCBK", "Rs.500 paid via UPI -SBI")).toBe("HDFC Bank");
  });

  it("SBI: sender-ID match (bank.json) and text-pattern match (vendor_banks.json) agree", () => {
    const viaSender = detectBank("VM-SBIINB", "Rs.500 debited from your account");
    const viaText = detectBank("VM-SOMESBI", "sbi alert: Rs.500 debited from your account");
    expect(viaSender).toBe("State Bank of India");
    expect(viaText).toBe("State Bank of India");
  });

  it("does not confuse State Bank of India with Bank of India (substring collision)", () => {
    expect(detectBank("VM-BOIIND", "Rs.500 debited")).toBe("Bank of India");
    const viaText = detectBank("VM-SOMEBOI", "boi alert: Rs.500 debited");
    expect(viaText).toBe("Bank of India");
    expect(viaText).not.toBe("State Bank of India");
  });

  it("every vendor_banks.json key resolves to a bank.json canonical name when one exists", () => {
    const bankNames = new Set(Object.keys(bankSeedRaw as Record<string, string[]>));
    const expectedMap: Record<string, string> = {
      "state bank of india": "State Bank of India",
      "icici bank": "ICICI Bank",
      hdfc: "HDFC Bank",
      "axis bank": "Axis Bank",
      "yes bank": "Yes Bank",
      "bank of india": "Bank of India",
      paytm: "Paytm Wallet",
      idbi: "IDBI Bank",
      "bank of baroda": "Bank of Baroda",
      "punjab national bank": "Punjab National Bank",
    };
    for (const [key, expected] of Object.entries(expectedMap)) {
      expect(bankNames.has(expected)).toBe(true);
      const patterns = (vendorBanksRaw as Record<string, string[]>)[key]!;
      const sender = `VM-X${patterns[0]!.toUpperCase()}X`;
      const resolved = detectBank(sender, "a transaction message");
      expect(resolved).toBe(expected);
    }
  });

  it("keys absent from bank.json (rbi, idfc) still resolve to a non-null name, not undefined/crash", () => {
    expect(detectBank("VM-XRBIX", "rbi notice")).toBe("Rbi");
    expect(detectBank("VM-XIDFCX", "idfc alert")).toBe("Idfc");
  });
});

describe("MalanaEngine terminal bank signatures", () => {
  const engine = createMalanaEngine();

  it.each([
    [
      "Dear UPI user A/C X1234 debited by 50.00 on date 21Aug26 trf to SAMPLE PERSON Refno 123456789012 If not u? call-1800111109 for other services-18001234-SBI",
      "50.00",
    ],
    [
      "Dear UPI user A/C X1234 debited by 175.00 on date 28Jul26 trf to SampleMerchant Refno 123456789013 If not u? call-1800111109 for other services-18001234-SBI",
      "175.00",
    ],
  ])("carries SBI identity into a parsed debit", (message, amount) => {
    const result = engine.parse(message, "+916300000000");
    expect(result).toMatchObject({
      acc: "X1234",
      bankName: "State Bank of India",
      category: "GRM_BANK",
      trx: amount,
      trxTypeRich: "EXPENSE",
    });
  });

  it("carries SBI identity into the reported mandate message shape", () => {
    const result = engine.parse(
      "UPI-Mandate successfully created towards SampleTravel for Rs1355.00. Funds blocked frm A/cXXXXXX1234.145839bcd3e4489893034bea0976d1a4@ybl -SBI",
      "+916300000000",
    );
    expect(result.bankName).toBe("State Bank of India");
  });
});
