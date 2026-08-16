// Exact 1:1 port of KarnatakaBankParser.kt from Cashiro parser-core
import { BankParser } from "../base-parser.js";

function parseNum(str: string): number | null {
  const n = parseFloat(str.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export class KarnatakaBankParser extends BankParser {
  getBankName(): string {
    return "Karnataka Bank";
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      u.includes("KARNATAKA BANK") ||
      u.includes("KARNATAKABANK") ||
      u.includes("KBLBNK") ||
      u.includes("KTKBANK") ||
      u.includes("KARBANK") ||
      // DLT patterns for transactions (-S suffix)
      /^[A-Z]{2}-KBLBNK-S$/.test(u) ||
      /^[A-Z]{2}-KARBANK-S$/.test(u) ||
      // Legacy patterns
      /^[A-Z]{2}-KBLBNK$/.test(u) ||
      // Direct sender IDs
      u === "KBLBNK" ||
      u === "KARBANK"
    );
  }

  protected override extractAmount(message: string): number | null {
    // Pattern 1: "DEBITED for Rs.6368/-"
    const debitMatch = /DEBITED\s+for\s+Rs\.?([0-9,]+(?:\.\d{2})?)\/?-?/i.exec(message);
    if (debitMatch?.[1]) {
      const val = parseNum(debitMatch[1]);
      if (val !== null) return val;
    }

    // Pattern 2: "credited by Rs.6600.00"
    const creditMatch = /credited\s+by\s+Rs\.?([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (creditMatch?.[1]) {
      const val = parseNum(creditMatch[1]);
      if (val !== null) return val;
    }

    return super.extractAmount(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    // Pattern 1: ACH transactions - "ACHInwDr-MERCHANT/date"
    const achMatch = /ACH[A-Za-z]*-([^/]+)\//i.exec(message);
    if (achMatch?.[1]) {
      const merchant = this.cleanMerchantName(achMatch[1].trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    // Pattern 2: "from <merchant> on" for UPI
    const fromMatch = /from\s+([^\s]+)\s+on/i.exec(message);
    if (fromMatch?.[1]) {
      const merchant = this.cleanMerchantName(fromMatch[1].trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    // Pattern 3: Check for specific transaction types
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes("lic of india")) return "LIC of India";
    if (lowerMessage.includes("upi") && fromMatch === null) return "UPI Transaction";

    return super.extractMerchant(message, sender);
  }

  protected override extractAccountLast4(message: string): string | null {
    // Pattern 1: "Account x001234x" or "Account XX1234X"
    const accountMatch1 = /Account\s+[xX]*([0-9]{4,6})[xX]*/i.exec(message);
    if (accountMatch1?.[1]) {
      const digits = accountMatch1[1];
      return digits.length > 4 ? digits.slice(-4) : digits;
    }

    // Pattern 2: "a/c XX1234"
    const accountMatch2 = /a\/c\s+[xX]{0,2}([0-9]{4,6})/i.exec(message);
    if (accountMatch2?.[1]) {
      return accountMatch2[1].slice(-4);
    }

    return super.extractAccountLast4(message);
  }

  protected override extractReference(message: string): string | null {
    // Pattern 1: "UPI Ref no 441877242175"
    const upiRefMatch = /UPI\s+Ref\s+no\s+([0-9]+)/i.exec(message);
    if (upiRefMatch?.[1]) return upiRefMatch[1];

    return super.extractReference(message);
  }

  protected override extractBalance(message: string): number | null {
    // Pattern: "Balance is Rs.705.92"
    const balanceMatch = /Balance\s+is\s+Rs\.?([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (balanceMatch?.[1]) {
      const val = parseNum(balanceMatch[1]);
      if (val !== null) return val;
    }

    return super.extractBalance(message);
  }
}
