// Exact 1:1 port of JioPaymentsBankParser.kt from Cashiro parser-core
import { BankParser } from "../base-parser.js";
import type { TransactionType } from "../types.js";

function parseNum(str: string): number | null {
  const n = parseFloat(str.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export class JioPaymentsBankParser extends BankParser {
  getBankName(): string {
    return "Jio Payments Bank";
  }

  canHandle(sender: string): boolean {
    return sender.toUpperCase().includes("JIOPBS");
  }

  protected override extractAmount(message: string): number | null {
    // Pattern 1: credited with Rs.1670.00
    const creditMatch = /credited\s+with\s+Rs\.?\s*([\d,]+(?:\.\d{2})?)/i.exec(message);
    if (creditMatch?.[1]) {
      const val = parseNum(creditMatch[1]);
      if (val !== null) return val;
    }

    // Pattern 2: Rs. 1170.00 Sent from
    const sentMatch = /Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+Sent\s+from/i.exec(message);
    if (sentMatch?.[1]) {
      const val = parseNum(sentMatch[1]);
      if (val !== null) return val;
    }

    // Pattern 3: debited with Rs. 1750.00
    const debitMatch = /debited\s+with\s+Rs\.?\s*([\d,]+(?:\.\d{2})?)/i.exec(message);
    if (debitMatch?.[1]) {
      const val = parseNum(debitMatch[1]);
      if (val !== null) return val;
    }

    return super.extractAmount(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    // Pattern: UPI/CR/700003371002/AMAN KU or UPI/DR/520300007125/AMAN KUM
    const upiMatch = /UPI\/(?:CR|DR)\/[\d]+\/([^.\n]+?)(?:\s*\.|$)/i.exec(message);
    if (upiMatch?.[1]) {
      const merchant = this.cleanMerchantName(upiMatch[1].trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    // If no specific merchant found, check transaction type
    const lower = message.toLowerCase();
    if (lower.includes("upi/cr")) return "UPI Credit";
    if (lower.includes("upi/dr")) return "UPI Payment";
    if (lower.includes("sent from")) return "Money Transfer";

    return super.extractMerchant(message, sender);
  }

  protected override extractAccountLast4(message: string): string | null {
    // Pattern 1: JPB A/c x4288
    const jpbMatch = /JPB\s+A\/c\s+x(\d{4})/i.exec(message);
    if (jpbMatch?.[1]) return jpbMatch[1];

    // Pattern 2: from x4288
    const fromMatch = /from\s+x(\d{4})/i.exec(message);
    if (fromMatch?.[1]) return fromMatch[1];

    return super.extractAccountLast4(message);
  }

  protected override extractBalance(message: string): number | null {
    // Pattern: Avl. Bal: Rs. 9095.5
    const balanceMatch = /Avl\.?\s*Bal:\s*Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/i.exec(message);
    if (balanceMatch?.[1]) {
      const val = parseNum(balanceMatch[1]);
      if (val !== null) return val;
    }

    return super.extractBalance(message);
  }

  protected override extractReference(message: string): string | null {
    // Pattern: UPI/CR/700003371002 or UPI/DR/520300007125
    const upiRefMatch = /UPI\/(?:CR|DR)\/(\d+)/i.exec(message);
    if (upiRefMatch?.[1]) return upiRefMatch[1];

    return super.extractReference(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();
    if (lower.includes("credited")) return "INCOME";
    if (lower.includes("upi/cr")) return "INCOME";
    if (lower.includes("debited")) return "EXPENSE";
    if (lower.includes("upi/dr")) return "EXPENSE";
    if (lower.includes("sent from")) return "EXPENSE";
    return super.extractTransactionType(message);
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();
    if (
      lower.includes("jpb a/c") ||
      lower.includes("upi/cr") ||
      lower.includes("upi/dr") ||
      lower.includes("sent from")
    ) {
      return true;
    }
    return super.isTransactionMessage(message);
  }
}
