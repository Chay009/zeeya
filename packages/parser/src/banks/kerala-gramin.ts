// Exact 1:1 port of KeralaGraminBankParser.kt from Cashiro parser-core
import { BankParser } from "../base-parser.js";
import type { TransactionType } from "../types.js";

function parseNum(str: string): number | null {
  const n = parseFloat(str.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export class KeralaGraminBankParser extends BankParser {
  getBankName(): string {
    return "Kerala Gramin Bank";
  }

  override getCurrency(): string {
    return "INR";
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return u.includes("KGBANK") || u.includes("KERALA GRAMIN") || u.includes("KERALAGR");
  }

  protected override extractAmount(message: string): number | null {
    // Pattern: "debited for Rs.160.00" or "credited with INR 3000"
    const m = /(?:debited for|credited with)\s+(?:Rs\.?|INR)\s*([0-9,]+(?:\.[0-9]{2})?)/i.exec(
      message,
    );
    if (m?.[1]) {
      const val = parseNum(m[1]);
      if (val !== null) return val;
    }
    return null;
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();

    if (lower.includes("debited for") || lower.includes("is debited")) {
      return "EXPENSE";
    }

    if (lower.includes("credited with") || lower.includes("is credited")) {
      return "INCOME";
    }

    return null;
  }

  protected override extractMerchant(message: string, _sender: string): string | null {
    // UPI debit — money sent via UPI, credited to another account
    if (/debited/i.test(message) && /credited to/i.test(message)) {
      return "UPI Transfer";
    }

    // UPI credit — from <id>@<provider>
    const upiFromMatch = /from\s+([^.\s]+@[a-z]+)/i.exec(message);
    if (upiFromMatch?.[1]) {
      const upiId = upiFromMatch[1].trim();
      const namePart = upiId.substring(0, upiId.indexOf("@"));
      // If it's a phone number@provider, return generic
      if (/^\d+$/.test(namePart)) {
        return "UPI Payment";
      }
      if (namePart.length > 0) {
        return this.cleanMerchantName(namePart);
      }
      return "UPI Payment";
    }

    return null;
  }

  protected override extractAccountLast4(message: string): string | null {
    // "Your a/c no. XXXX12345" or "Account XXXX123"
    const m = /(?:a\/c no\.|Account)\s+(?:XXXX|XX)(\d{3,5})/i.exec(message);
    if (m?.[1]) {
      const digits = m[1];
      if (digits.length >= 4) {
        return digits.slice(-4);
      }
      return digits.padStart(4, "0");
    }
    return null;
  }

  protected override extractReference(message: string): string | null {
    // "UPI Ref no 170632692557" or "UPI Ref. no. 529807237409"
    const m = /UPI Ref\.?\s*no\.?\s*(\d+)/i.exec(message);
    return m?.[1] ?? null;
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();

    if (lower.includes("otp") || lower.includes("password")) {
      return false;
    }

    const transactionKeywords = ["debited for", "is debited", "credited with", "is credited"];

    return transactionKeywords.some((kw) => lower.includes(kw));
  }
}
