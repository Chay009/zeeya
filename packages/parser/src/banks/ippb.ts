// Exact 1:1 port of IPPBParser.kt from Cashiro parser-core
import { BankParser } from "../base-parser.js";
import type { TransactionType } from "../types.js";

function parseNum(str: string): number | null {
  const n = parseFloat(str.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export class IPPBParser extends BankParser {
  getBankName(): string {
    return "India Post Payments Bank";
  }

  canHandle(sender: string): boolean {
    const normalizedSender = sender.toUpperCase();
    // Pattern: XX-IPBMSG-S or XX-IPBMSG-T where XX is any two letters
    return /^[A-Z]{2}-IPBMSG-[ST]$/.test(normalizedSender);
  }

  protected override extractAmount(message: string): number | null {
    // Pattern: Rs.1.00 or Rs. 1.00
    const m = /Rs\.?\s*([\d,]+(?:\.\d{2})?)/i.exec(message);
    if (m?.[1]) {
      const val = parseNum(m[1]);
      if (val !== null) return val;
    }
    return super.extractAmount(message);
  }

  protected override extractAccountLast4(message: string): string | null {
    // Pattern: A/C X1234 or a/c X1234
    const m = /[Aa]\/[Cc]\s+X?(\d+)/i.exec(message);
    if (m?.[1]) {
      const accountNumber = m[1];
      return accountNumber.length >= 4 ? accountNumber.slice(-4) : accountNumber;
    }
    return super.extractAccountLast4(message);
  }

  protected override extractBalance(message: string): number | null {
    // Pattern: Avl Bal Rs.436.91
    const m = /Avl\s+Bal\s+Rs\.?\s*([\d,]+(?:\.\d{2})?)/i.exec(message);
    if (m?.[1]) {
      const val = parseNum(m[1]);
      if (val !== null) return val;
    }
    return super.extractBalance(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    const lowerMessage = message.toLowerCase();

    // Pattern 1: "for UPI to john@superyes" (Debit)
    if (lowerMessage.includes("debit")) {
      const toMatch = /to\s+([^\s]+(?:@[^\s]+)?)/i.exec(message);
      if (toMatch?.[1]) {
        const merchant = toMatch[1].trim();
        // Clean up UPI ID if needed
        if (merchant.includes("@")) {
          const name = merchant.split("@")[0] ?? merchant;
          return this.cleanMerchantName(name);
        } else {
          return this.cleanMerchantName(merchant);
        }
      }

      // Fallback: "for UPI" without specific merchant
      if (lowerMessage.includes("for upi")) {
        return "UPI Payment";
      }
    }

    // Pattern 2: "from john doe thru IPPB" (Credit)
    if (lowerMessage.includes("received a payment")) {
      const fromMatch = /from\s+(.+?)\s+thru/i.exec(message);
      if (fromMatch?.[1]) {
        const senderName = fromMatch[1].trim();
        return this.cleanMerchantName(senderName);
      }
    }

    return super.extractMerchant(message, sender);
  }

  protected override extractReference(message: string): string | null {
    // Pattern 1: Ref 560002638161
    const refMatch = /Ref\s+(\d+)/i.exec(message);
    if (refMatch?.[1]) {
      return refMatch[1];
    }

    // Pattern 2: Info: UPI/CREDIT/523498793035
    const infoMatch = /Info:\s*UPI\/[^/]+\/(\d+)/i.exec(message);
    if (infoMatch?.[1]) {
      return infoMatch[1];
    }

    return super.extractReference(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes("debit")) return "EXPENSE";
    if (lowerMessage.includes("received a payment")) return "INCOME";
    if (lowerMessage.includes("credit") && lowerMessage.includes("info: upi/credit"))
      return "INCOME";
    return super.extractTransactionType(message);
  }

  protected override isTransactionMessage(message: string): boolean {
    const lowerMessage = message.toLowerCase();

    // Check for IPPB-specific transaction keywords
    if (
      lowerMessage.includes("debit rs") ||
      lowerMessage.includes("received a payment") ||
      (lowerMessage.includes("info: upi") && lowerMessage.includes("credit"))
    ) {
      return true;
    }

    return super.isTransactionMessage(message);
  }
}
