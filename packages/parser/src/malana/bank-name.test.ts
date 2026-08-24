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

  it("detects SBI via body-text fallback when the sender carries no bank-identifying pattern at all", () => {
    // Real-world gap: bank.json's sender-ID list only covers ~12 known SBI
    // short codes, and vendor_banks.json's own "sbi" pattern (Layer 2) only
    // ever matches against the *sender*, never the message body — so an
    // SBI UPI notification whose sender isn't among those 12 codes had no
    // fallback at all, despite real SBI UPI messages reliably ending their
    // body with a "-SBI" suffix. Reported against three real messages
    // whose sender was a plain phone number; detectBank() returned null
    // for all three before this fix.
    const body =
      "Dear UPI user A/C X8124 debited by 50.00 on date 21Aug26 trf to RAJPUROHIT NAREN Refno 258565338181 If not u? call-1800111109 for other services-18001234-SBI";
    expect(detectBank("+916304890311", body)).toBe("State Bank of India");
  });

  it("the SBI body fallback matches only the standalone word, not a substring inside another token", () => {
    // Guards the \b...\b word-boundary choice itself: "SBICRD1234" contains
    // "sbi" as a substring but is one compound token, not the standalone
    // word "SBI" — the fallback must not fire on it (that sender-ID shape
    // is already Layer 1's job, via bank.json's own "SBICRD" entry).
    expect(detectBank("VM-UNKNOWN", "reference SBICRD1234 for your recent purchase")).toBeNull();
  });
});
