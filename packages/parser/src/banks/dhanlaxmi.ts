// 1:1 port of DhanlaxmiBankParser.kt from Cashiro parser-core
import { BankParser } from "../base-parser.js";
import type { TransactionType } from "../types.js";

export class DhanlaxmiBankParser extends BankParser {
  getBankName(): string {
    return "Dhanlaxmi Bank";
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      u.includes("DHANBK") ||
      u.includes("DHANLAXMI") ||
      /^[A-Z]{2}-DHANBK-?[A-Z]?$/.test(u) ||
      /^[A-Z]{2}-DHANBK$/.test(u)
    );
  }

  protected override extractAmount(message: string): number | null {
    // Pattern 1: "INR 20.00 is debited" or "INR 10.00 is credited"
    const inrPattern = /INR\s+([0-9,]+(?:\.\d{2})?)\s+is\s+(?:debited|credited)/i.exec(message);
    if (inrPattern?.[1]) {
      const val = parseFloat(inrPattern[1].replace(/,/g, ""));
      if (isFinite(val)) return val;
    }

    // Pattern 2: "credited for Rs.10.00" or "debited for Rs.10.00"
    const rsPattern = /(?:credited|debited)\s+for\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (rsPattern?.[1]) {
      const val = parseFloat(rsPattern[1].replace(/,/g, ""));
      if (isFinite(val)) return val;
    }

    return super.extractAmount(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();
    if (lower.includes("is debited")) return "EXPENSE";
    if (lower.includes("is credited")) return "INCOME";
    if (lower.includes("debited from")) return "EXPENSE";
    if (lower.includes("credited to")) return "INCOME";
    if (lower.includes("credited for")) return "INCOME";
    return super.extractTransactionType(message);
  }

  protected override extractAccountLast4(message: string): string | null {
    // Pattern 1: "A/c XXXX1234"
    const acMatch = /A\/c\s+X+(\d{4})/i.exec(message);
    if (acMatch?.[1]) return acMatch[1];

    // Pattern 2: "a/c no. XXXXXXXX1234"
    const acNoMatch = /a\/c\s+no\.\s*X+(\d{4})/i.exec(message);
    if (acNoMatch?.[1]) return acNoMatch[1];

    return super.extractAccountLast4(message);
  }

  protected override extractBalance(message: string): number | null {
    // Pattern: "Aval Bal is INR 26,578.49"
    const m = /Aval\s+Bal\s+is\s+INR\s+([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (m?.[1]) {
      const val = parseFloat(m[1].replace(/,/g, ""));
      if (isFinite(val)) return val;
    }
    return super.extractBalance(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    if (/UPI\s+TXN/i.test(message)) {
      // "Payment from PhonePe"
      const fromMatch = /Payment\s+from\s+([^/"]+)/i.exec(message);
      if (fromMatch?.[1]) {
        const merchant = this.cleanMerchantName(fromMatch[1].trim());
        if (this.isValidMerchantName(merchant)) return merchant;
      }

      // "payment on <merchant>"
      const onMatch = /payment\s+on\s+(\w+)/i.exec(message);
      if (onMatch?.[1]) {
        const merchant = this.cleanMerchantName(onMatch[1].trim());
        if (this.isValidMerchantName(merchant)) return merchant;
      }

      return "UPI Payment";
    }

    if (/debited from a\/c/i.test(message) && /credited/i.test(message)) {
      return "Internal Transfer";
    }

    return super.extractMerchant(message, sender);
  }

  protected override extractReference(message: string): string | null {
    // "UPI Ref no 123456"
    const upiRefMatch = /UPI\s+Ref\s+no\s+(\d+)/i.exec(message);
    if (upiRefMatch?.[1]) return upiRefMatch[1];

    // "UPI TXN: /675325120952"
    const txnRefMatch = /UPI\s+TXN:\s*\/(\d+)/i.exec(message);
    if (txnRefMatch?.[1]) return txnRefMatch[1];

    return super.extractReference(message);
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();

    if (
      lower.includes("otp") ||
      lower.includes("one time password") ||
      lower.includes("verification code")
    ) {
      return false;
    }

    const keywords = ["is debited from", "is credited to", "credited for", "debited from a/c"];
    if (keywords.some((k) => lower.includes(k))) return true;

    return super.isTransactionMessage(message);
  }
}
