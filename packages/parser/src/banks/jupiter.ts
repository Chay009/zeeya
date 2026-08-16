// Exact 1:1 port of JupiterBankParser.kt from Cashiro parser-core
import { BankParser } from "../base-parser.js";

export class JupiterBankParser extends BankParser {
  getBankName(): string {
    return "Jupiter";
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      /^[A-Z]{2}-JTEDGE-S$/.test(u) ||
      /^[A-Z]{2}-JTEDGE-T$/.test(u) ||
      // Legacy pattern
      /^[A-Z]{2}-JTEDGE$/.test(u)
    );
  }

  protected override extractAmount(message: string): number | null {
    // Pattern 1: "Rs.130.00 debited"
    const debitMatch = /Rs\.?\s*([0-9,]+(?:\.\d{2})?)\s+debited/i.exec(message);
    if (debitMatch?.[1]) {
      const val = parseFloat((debitMatch[1] ?? "").replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    // Pattern 2: "Rs.XXX credited"
    const creditMatch = /Rs\.?\s*([0-9,]+(?:\.\d{2})?)\s+credited/i.exec(message);
    if (creditMatch?.[1]) {
      const val = parseFloat((creditMatch[1] ?? "").replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    return super.extractAmount(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    const lower = message.toLowerCase();

    if (lower.includes("edge csb bank rupay credit card")) return "Credit Card Payment";
    if (lower.includes("jupiter csb edge")) return "Credit Card Payment";
    if (lower.includes("credit card")) return "Credit Card Payment";
    if (lower.includes("upi")) return "UPI Transaction";

    return super.extractMerchant(message, sender) ?? "Jupiter Transaction";
  }

  protected override extractAccountLast4(message: string): string | null {
    // Pattern 1: "ending 6852"
    const endingMatch = /ending\s+(\d{4})/i.exec(message);
    if (endingMatch?.[1]) return endingMatch[1];

    // Pattern 2: "Card ending 6852"
    const cardEndingMatch = /Card\s+ending\s+(\d{4})/i.exec(message);
    if (cardEndingMatch?.[1]) return cardEndingMatch[1];

    return super.extractAccountLast4(message);
  }

  protected override extractReference(message: string): string | null {
    // Pattern: "UPI Ref no.281751568470"
    const upiRefMatch = /UPI\s+Ref\s+no\.?\s*([A-Za-z0-9]+)/i.exec(message);
    if (upiRefMatch?.[1]) return upiRefMatch[1];

    return super.extractReference(message);
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();

    // Skip dispute instructions (not a transaction)
    if (lower.includes("to dispute") && lower.includes("call")) {
      // This is just instruction text, don't skip the entire message
    }

    // Check for Jupiter-specific transaction keywords
    if (lower.includes("jupiter") || lower.includes("csb")) {
      // If it's from Jupiter/CSB and has transaction keywords, it's likely valid
      return super.isTransactionMessage(message);
    }

    return super.isTransactionMessage(message);
  }
}
