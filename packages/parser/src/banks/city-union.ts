// Exact 1:1 port of CityUnionBankParser.kt from Cashiro parser-core
import { BankParser } from "../base-parser.js";
import type { TransactionType } from "../types.js";

/**
 * Parser for City Union Bank SMS messages
 *
 * Common senders: JK-CUBLTD-S, XX-CUBLTD-T, CUBANK, etc.
 *
 * SMS Formats:
 * - Your a/c no. XXXXXXXXXXXXXXX is debited for Rs.111.00 on 01-09-2025 and credited to a/c no. YYYYYYYYYYYYYYY (UPI Ref no 123456789012)
 * - Your a/c no. XXXXXXXXXXXXXXX is credited for Rs.111.00 on 01-09-2025 and debited from a/c no. YYYYYYYYYYYYYYY (UPI Ref no 123456789012)
 * - Savings No XXXXXXXXXXXXXXX credited with INR 111.00 towards BY NEFT TRF:AMBANI YYYYYYYYYYYYYYY: on 01-SEP-2025. Avl Bal 120.00
 */

function parseNum(str: string): number | null {
  const n = parseFloat(str.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export class CityUnionBankParser extends BankParser {
  getBankName(): string {
    return "City Union Bank";
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return u.includes("CUBANK") || u.includes("CUBLTD") || u.includes("CUB");
  }

  protected override extractAmount(message: string): number | null {
    const patterns = [
      // "debited for Rs.111.00"
      /debited\s+for\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
      // "credited for Rs.111.00"
      /credited\s+for\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
      // "credited with INR 111.00"
      /credited\s+with\s+INR\s*([0-9,]+(?:\.\d{2})?)/i,
    ];
    for (const pattern of patterns) {
      const m = pattern.exec(message);
      if (m?.[1]) {
        const val = parseNum(m[1]);
        if (val !== null) return val;
      }
    }
    return super.extractAmount(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();
    if (lower.includes("is debited")) return "EXPENSE";
    if (lower.includes("debited for")) return "EXPENSE";
    if (lower.includes("debited from")) return "EXPENSE";
    if (lower.includes("is credited")) return "INCOME";
    if (lower.includes("credited for")) return "INCOME";
    if (lower.includes("credited with")) return "INCOME";
    if (lower.includes("credited to")) return "INCOME";
    if (lower.includes("neft trf")) return "INCOME";
    return super.extractTransactionType(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    const lower = message.toLowerCase();

    // NEFT Transfer pattern
    if (lower.includes("neft trf")) {
      // Extract sender name from "BY NEFT TRF:NAME"
      const neftPattern = /BY\s+NEFT\s+TRF:([^:]+)/i;
      const m = neftPattern.exec(message);
      if (m?.[1]) {
        const merchant = this.cleanMerchantName(m[1].trim());
        return `NEFT - ${merchant}`;
      }
      return "NEFT Transfer";
    }

    // UPI Transaction
    if (/UPI\s+Ref/i.test(message)) {
      // Try to extract the other account details
      const toAccountPattern = /credited\s+to\s+a\/c\s+no\.\s+([A-Z0-9]+)/i;
      const fromAccountPattern = /debited\s+from\s+a\/c\s+no\.\s+([A-Z0-9]+)/i;

      const toMatch = toAccountPattern.exec(message);
      if (toMatch?.[1]) {
        const raw = toMatch[1];
        const accountLast4 = raw.length >= 4 ? raw.slice(-4) : raw;
        return `UPI Transfer to A/C XX${accountLast4}`;
      }

      const fromMatch = fromAccountPattern.exec(message);
      if (fromMatch?.[1]) {
        const raw = fromMatch[1];
        const accountLast4 = raw.length >= 4 ? raw.slice(-4) : raw;
        return `UPI Transfer from A/C XX${accountLast4}`;
      }

      return "UPI Transfer";
    }

    // Generic transfer
    if (lower.includes("credited to a/c") || lower.includes("debited from a/c")) {
      return "Account Transfer";
    }

    return super.extractMerchant(message, sender);
  }

  protected override extractAccountLast4(message: string): string | null {
    // Pattern: "Your a/c no. XXXXXXXXXXXXXXX" or "Savings No XXXXXXXXXXXXXXX"
    const patterns = [/Your\s+a\/c\s+no\.\s+[Xx]*(\d{3,4})/i, /Savings\s+No\s+[Xx]*(\d{3,4})/i];
    for (const pattern of patterns) {
      const m = pattern.exec(message);
      if (m?.[1]) {
        const digits = m[1];
        return digits.length >= 4 ? digits.slice(-4) : digits;
      }
    }
    return super.extractAccountLast4(message);
  }

  protected override extractBalance(message: string): number | null {
    // Pattern: "Avl Bal 120.00"
    const m = /Avl\s+Bal\s+([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (m?.[1]) return parseNum(m[1]);
    return super.extractBalance(message);
  }

  protected override extractReference(message: string): string | null {
    // Pattern: "(UPI Ref no 123456789012)"
    const upiRef = /\(UPI\s+Ref\s+no\s+(\d+)\)/i.exec(message);
    if (upiRef?.[1]) return upiRef[1];

    // NEFT transaction ID if present
    const neftRef = /NEFT[:/]\s*([A-Z0-9]+)/i.exec(message);
    if (neftRef?.[1]) return neftRef[1];

    return super.extractReference(message);
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();

    // Skip OTP and non-transaction messages
    if (lower.includes("otp") || lower.includes("verification") || lower.includes("request")) {
      return false;
    }

    // Check for City Union Bank specific transaction patterns
    if (
      lower.includes("is debited for") ||
      lower.includes("is credited for") ||
      lower.includes("credited with") ||
      lower.includes("neft trf")
    ) {
      return true;
    }

    return super.isTransactionMessage(message);
  }
}
