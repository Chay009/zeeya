// Exact 1:1 port of SouthIndianBankParser.kt from Cashiro parser-core
import { BankParser } from "../base-parser.js";
import type { TransactionType } from "../types.js";

function parseNum(str: string): number | null {
  const n = parseFloat(str.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export class SouthIndianBankParser extends BankParser {
  getBankName(): string {
    return "South Indian Bank";
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    const sibSenders = new Set([
      "SIBSMS",
      "AD-SIBSMS",
      "CP-SIBSMS",
      "SIBSMS-S",
      "AD-SIBSMS-S",
      "CP-SIBSMS-S",
      "SOUTHINDIANBANK",
      "SIBBANK",
    ]);
    if (sibSenders.has(u)) return true;
    if (u.includes("SIBSMS")) return true;
    if (u.includes("SIBBANK")) return true;
    return u.startsWith("AD-SIB") || u.startsWith("CP-SIB") || u.startsWith("VM-SIB");
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();
    // Skip OTP and promotional messages
    if (
      lower.includes("otp") ||
      lower.includes("one time password") ||
      lower.includes("verification code") ||
      lower.includes("offer") ||
      lower.includes("discount")
    )
      return false;
    // Skip UPI auto-pay scheduled reminders
    if (lower.includes("upi auto pay") && lower.includes("is scheduled on")) return false;
    // Check for transaction keywords (broader than base class: 'debit' not just 'debited', plus 'upi' etc.)
    const keywords = [
      "debit",
      "credit",
      "withdrawn",
      "deposited",
      "spent",
      "received",
      "transferred",
      "paid",
      "purchase",
      "refund",
      "cashback",
      "upi",
    ];
    return keywords.some((kw) => lower.includes(kw));
  }

  protected override extractAmount(message: string): number | null {
    const m = /(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (m?.[1]) {
      const val = parseNum(m[1]);
      if (val !== null) return val;
    }
    return super.extractAmount(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();
    if (lower.includes("debit")) return "EXPENSE";
    if (lower.includes("withdrawn")) return "EXPENSE";
    if (lower.includes("spent")) return "EXPENSE";
    if (lower.includes("purchase")) return "EXPENSE";
    if (lower.includes("paid")) return "EXPENSE";
    if (lower.includes("transfer to")) return "EXPENSE";
    if (lower.includes("credit")) return "INCOME";
    if (lower.includes("deposited")) return "INCOME";
    if (lower.includes("received")) return "INCOME";
    if (lower.includes("refund")) return "INCOME";
    if (lower.includes("transfer from")) return "INCOME";
    if (lower.includes("cashback")) return "INCOME";
    return null;
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    const lower = message.toLowerCase();

    // For IMPS transactions — "Info: IMPS/FDRL/REF/MERCHANT." format
    if (lower.includes("imps") && /info:/i.test(message)) {
      const m = /Info:\s*IMPS\/[^/]+\/[^/]+\/([^.]+)/i.exec(message);
      if (m?.[1]) {
        const merchant = m[1].trim();
        if (merchant.length > 0) return this.cleanMerchantName(merchant);
      }
    }

    // For UPI transactions
    if (lower.includes("upi")) {
      // "Info:UPI/IPOS/number/MERCHANT NAME on" format
      const infoM = /Info:UPI\/[^/]+\/[^/]+\/([^/]+?)\s+on/i.exec(message);
      if (infoM?.[1]) {
        const merchant = infoM[1].trim();
        if (merchant.length > 0) return this.cleanMerchantName(merchant);
      }

      // "to merchant@upi" pattern — only look in first 200 chars to avoid footer numbers
      const prefix = message.slice(0, 200);
      const toM = /to\s+([^,\s]+@[^\s,]+)/i.exec(prefix);
      if (toM?.[1]) {
        const merchant = toM[1].trim();
        if (merchant.length > 0) return this.cleanMerchantName(merchant);
      }

      // "from merchant@upi" pattern for incoming credits
      if (lower.includes("credit")) {
        const fromM = /from\s+([^,\s]+@[^\s,]+)/i.exec(prefix);
        if (fromM?.[1]) {
          const merchant = fromM[1].trim();
          if (merchant.length > 0) return this.cleanMerchantName(merchant);
        }
        return "UPI Credit";
      }

      return "UPI Transaction";
    }

    // For non-UPI debit/credit — "DEBIT:Rs.983.75 MERCHANT NAME Bal:..." format
    if ((lower.includes("debit") || lower.includes("credit")) && !lower.includes("upi")) {
      const m =
        /(?:DEBIT|CREDIT)[:\s]*Rs\.?\s*[0-9,]+(?:\.\d{2})?\s+([A-Z\s]+?)\s+(?:Bal|Available)/i.exec(
          message,
        );
      if (m?.[1]) {
        const merchant = m[1].trim();
        if (merchant.length > 2) return this.cleanMerchantName(merchant);
      }
    }

    // ATM withdrawals
    if (lower.includes("atm") || lower.includes("withdrawn")) {
      return "ATM";
    }

    // Card transactions — try to extract merchant after "at"
    if (lower.includes("card")) {
      const m = /at\s+([^,\n]+?)(?:\s+on|\s*,|$)/i.exec(message);
      if (m?.[1]) {
        const merchant = m[1].trim();
        if (merchant.length > 0) return this.cleanMerchantName(merchant);
      }
    }

    return super.extractMerchant(message, sender);
  }

  protected override extractReference(message: string): string | null {
    // IMPS reference in "Info: IMPS/BANK/REF/MERCHANT" format
    if (message.toLowerCase().includes("imps") && /info:/i.test(message)) {
      const m = /Info:\s*IMPS\/[^/]+\/([^/]+)\//i.exec(message);
      if (m?.[1]) {
        const ref = m[1].trim();
        if (ref.length > 0) return ref;
      }
    }

    // RRN (12-digit reconciliation reference number)
    const rrnM = /RRN[:\s]*(\d{12})/i.exec(message);
    if (rrnM?.[1]) return rrnM[1].trim();

    // Generic reference number
    const refM = /Ref(?:erence)?[:\s]*([A-Z0-9]+)/i.exec(message);
    if (refM?.[1]) return refM[1].trim();

    return super.extractReference(message);
  }

  protected override extractAccountLast4(message: string): string | null {
    const patterns = [
      /A\/c\s+[X*]*(\d{4})/i,
      /Account\s+[X*]*(\d{4})/i,
      /from\s+[X*]*(\d{4})/i,
      /to\s+[X*]*(\d{4})/i,
    ];
    for (const pattern of patterns) {
      const m = pattern.exec(message);
      if (m?.[1]) return m[1];
    }
    return super.extractAccountLast4(message);
  }

  protected override extractBalance(message: string): number | null {
    const patterns = [
      /Final\s+balance\s+is\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
      /Bal(?:ance)?[:\s]*Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
      /Available\s+Bal(?:ance)?[:\s]*Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
      /Avl\s+Bal[:\s]*Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
    ];
    for (const pattern of patterns) {
      const m = pattern.exec(message);
      if (m?.[1]) {
        const val = parseNum(m[1]);
        if (val !== null) return val;
      }
    }
    return super.extractBalance(message);
  }
}
