// Exact 1:1 port of YesBankParser.kt from Cashiro parser-core
import { BankParser } from "../base-parser.js";
import type { TransactionType } from "../types.js";

export class YesBankParser extends BankParser {
  getBankName(): string {
    return "Yes Bank";
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      /^[A-Z]{2}-YESBNK-S$/.test(u) ||
      /^[A-Z]{2}-YESBNK$/.test(u) ||
      u === "YESBNK" ||
      u === "YESBANK"
    );
  }

  protected override extractAmount(message: string): number | null {
    const m = /INR\s+([0-9,]+(?:\.\d{2})?)\s+spent/i.exec(message);
    if (m?.[1]) {
      const val = parseFloat(m[1].replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }
    return super.extractAmount(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    const m1 = /@UPI_([^0-9]+?)(?:\s+\d{2}-\d{2}-\d{4})/i.exec(message);
    if (m1?.[1]) {
      const merchant = m1[1].replace(/\s+/g, " ").trim();
      if (merchant.length > 0) return merchant;
    }

    const m2 = /@UPI_([A-Z\s]+)/i.exec(message);
    if (m2?.[1]) {
      const merchant = m2[1].replace(/\s+/g, " ").trim();
      if (merchant.length > 0 && this.isValidMerchantName(merchant)) return merchant;
    }

    return super.extractMerchant(message, sender);
  }

  protected override extractAccountLast4(message: string): string | null {
    const m1 = /YES\s+BANK\s+Card\s+[X]*(\d+)/i.exec(message);
    if (m1?.[1]) {
      const n = m1[1];
      return n.length >= 4 ? n.slice(-4) : n;
    }

    const m2 = /SMS\s+BLKCC\s+(\d{4})/i.exec(message);
    if (m2?.[1]) return m2[1];

    return super.extractAccountLast4(message);
  }

  protected override extractAvailableLimit(message: string): number | null {
    const m = /Avl\s+Lmt\s+INR\s+([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (m?.[1]) {
      const val = parseFloat(m[1].replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }
    return super.extractAvailableLimit(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();
    if (this.isInvestmentTransaction(lower)) return "INVESTMENT";
    if (lower.includes("spent") && lower.includes("yes bank card") && lower.includes("avl lmt"))
      return "CREDIT";
    if (lower.includes("debited")) return "EXPENSE";
    if (lower.includes("withdrawn")) return "EXPENSE";
    if (lower.includes("spent")) return "EXPENSE";
    if (lower.includes("charged")) return "EXPENSE";
    if (lower.includes("paid")) return "EXPENSE";
    if (lower.includes("credited")) return "INCOME";
    if (lower.includes("deposited")) return "INCOME";
    if (lower.includes("received")) return "INCOME";
    if (lower.includes("refund")) return "INCOME";
    return null;
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();
    if (
      lower.includes("otp") ||
      lower.includes("verification") ||
      lower.includes("one time password")
    )
      return false;
    if (lower.includes("offer") || lower.includes("cashback offer") || lower.includes("discount"))
      return false;
    const keywords = [
      "spent on yes bank card",
      "debited",
      "credited",
      "withdrawn",
      "deposited",
      "avl lmt",
    ];
    if (keywords.some((k) => lower.includes(k))) return true;
    return super.isTransactionMessage(message);
  }

  protected override detectIsCard(message: string): boolean {
    const lower = message.toLowerCase();
    if (lower.includes("yes bank card")) return true;
    if (lower.includes("sms blkcc")) return true;
    return super.detectIsCard(message);
  }
}
