// 1:1 port of AUBankParser.kt from Cashiro parser-core
import { BankParser } from "../base-parser.js";
import type { TransactionType } from "../types.js";

export class AUBankParser extends BankParser {
  getBankName(): string {
    return "AU Small Finance Bank";
  }

  canHandle(sender: string): boolean {
    return sender.toUpperCase().includes("AUBANK");
  }

  protected override extractAmount(message: string): number | null {
    // Pattern 1: Credited INR XXX to
    const creditedMatch = /Credited\s+INR\s+([0-9,]+(?:\.\d{2})?)\s+to/i.exec(message);
    if (creditedMatch?.[1]) {
      const val = parseFloat(creditedMatch[1].replace(/,/g, ""));
      if (isFinite(val)) return val;
    }

    // Pattern 2: Debited INR XXX from
    const debitedMatch = /Debited\s+INR\s+([0-9,]+(?:\.\d{2})?)\s+from/i.exec(message);
    if (debitedMatch?.[1]) {
      const val = parseFloat(debitedMatch[1].replace(/,/g, ""));
      if (isFinite(val)) return val;
    }

    // Pattern 3: INR XXX spent
    const spentMatch = /INR\s+([0-9,]+(?:\.\d{2})?)\s+spent/i.exec(message);
    if (spentMatch?.[1]) {
      const val = parseFloat(spentMatch[1].replace(/,/g, ""));
      if (isFinite(val)) return val;
    }

    // Pattern 4: withdrawn INR XXX
    const withdrawnMatch = /withdrawn\s+INR\s+([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (withdrawnMatch?.[1]) {
      const val = parseFloat(withdrawnMatch[1].replace(/,/g, ""));
      if (isFinite(val)) return val;
    }

    return super.extractAmount(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    // Pattern 0: credit card — "spent at MERCHANT on AU Bank"
    const spentAtMatch = /spent\s+at\s+(.+?)\s+on\s+(?:AU\s+Bank|$)/i.exec(message);
    if (spentAtMatch?.[1]) {
      const merchant = this.cleanMerchantName(spentAtMatch[1].trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    // Pattern 1: UPI/DR/ref/MERCHANT/IFSC/acct
    const upiDrCrMatch = /UPI\/(?:DR|CR)\/\d+\/([^/]+)\/[A-Z]{4}\d*\/\d+/i.exec(message);
    if (upiDrCrMatch?.[1]) {
      const merchant = this.cleanMerchantName(upiDrCrMatch[1].trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    // Pattern 2: Ref UPI/.../name(account)
    const upiRefMatch = /Ref\s+UPI\/[^/]+\/[^/]+\/[^/]+\s+([^(]+)\([^)]+\)/i.exec(message);
    if (upiRefMatch?.[1]) {
      const merchant = this.cleanMerchantName(upiRefMatch[1].trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    // Pattern 3: UPI paren format
    const upiParenMatch = /UPI\/[^/]+\/[^/]+\/[^/]+\s+[^(]*\(([^)]+)\)/i.exec(message);
    if (upiParenMatch?.[1]) {
      const merchant = this.cleanMerchantName(upiParenMatch[1].trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    // Pattern 4: ATM transactions
    if (/ATM/i.test(message) || /withdrawn/i.test(message)) {
      return "ATM Withdrawal";
    }

    // Pattern 5: General to/from
    const toFromMatch = /(?:to|from)\s+([^.\n]+?)(?:\.\s*|$)/i.exec(message);
    if (toFromMatch?.[1]) {
      const merchant = this.cleanMerchantName(toFromMatch[1].trim());
      if (this.isValidMerchantName(merchant) && !/A\/c/i.test(merchant)) return merchant;
    }

    return super.extractMerchant(message, sender);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();
    if (lower.includes("credit card")) return "CREDIT";
    if (lower.includes("credited")) return "INCOME";
    if (lower.includes("received")) return "INCOME";
    if (lower.includes("deposited")) return "INCOME";
    if (lower.includes("refund")) return "INCOME";
    if (lower.includes("debited")) return "EXPENSE";
    if (lower.includes("withdrawn")) return "EXPENSE";
    if (lower.includes("spent")) return "EXPENSE";
    if (lower.includes("paid")) return "EXPENSE";
    return super.extractTransactionType(message);
  }

  protected override extractAccountLast4(message: string): string | null {
    // Try base first
    const base = super.extractAccountLast4(message);
    if (base) return base;

    // AU Bank specific
    const auMatch = /(?:A\/c|Card)\s*[A-Za-z]*[Xx*]*(\d+)/i.exec(message);
    if (auMatch?.[1]) {
      const d = auMatch[1];
      return d.length >= 4 ? d.slice(-4) : d;
    }

    return null;
  }

  protected override extractBalance(message: string): number | null {
    // "Bal INR XXX"
    const m = /Bal\s+INR\s+([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (m?.[1]) {
      const val = parseFloat(m[1].replace(/,/g, ""));
      if (isFinite(val)) return val;
    }
    return super.extractBalance(message);
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

    const keywords = [
      "credited inr",
      "debited inr",
      "withdrawn inr",
      "bal inr",
      "ref upi",
      "spent",
    ];
    if (keywords.some((k) => lower.includes(k))) return true;

    return super.isTransactionMessage(message);
  }
}
