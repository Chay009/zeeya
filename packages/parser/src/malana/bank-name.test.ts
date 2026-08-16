/**
 * Regression test for the duplicate-bank-card bug: detectBank() must return
 * the exact same string for the same real bank regardless of which layer
 * matched it (bank.json sender-ID match vs vendor_banks.json text/UPI-handle
 * match). See enrichment.ts's resolveBankName() for the fix — vendor_banks.json
 * resolves its names through bank.json instead of inventing its own casing.
 */
import { describe, it, expect } from "vitest";
import { detectBank } from "./enrichment.js";
import vendorBanksRaw from "./data/vendor_banks.json";
import bankSeedRaw from "./data/bank.json";

describe("detectBank — cross-layer name consistency", () => {
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
