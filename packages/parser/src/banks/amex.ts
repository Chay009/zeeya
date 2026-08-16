// 1:1 port of AMEXBankParser.kt from Cashiro parser-core
import { BankParser } from "../base-parser.js";
import type { ParsedTransaction, TransactionType } from "../types.js";

export class AMEXBankParser extends BankParser {
  getBankName(): string {
    return "American Express";
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      u.includes("AMEX") ||
      u.includes("AMEXIN") ||
      /^[A-Z]{2}-AMEXIN-S$/.test(u) ||
      /^[A-Z]{2}-AMEX-S$/.test(u) ||
      /^[A-Z]{2}-AMEXIN-[TPG]$/.test(u) ||
      /^[A-Z]{2}-AMEX-[TPG]$/.test(u) ||
      /^[A-Z]{2}-AMEXIN$/.test(u) ||
      /^[A-Z]{2}-AMEX$/.test(u) ||
      u === "AMEXIN" ||
      u === "AMEX"
    );
  }

  override parse(smsBody: string, sender: string, timestamp: number): ParsedTransaction | null {
    const parsed = super.parse(smsBody, sender, timestamp);
    if (!parsed) return null;
    return { ...parsed, type: "CREDIT" as TransactionType };
  }

  protected override extractAmount(message: string): number | null {
    // "You've spent INR 1,017.70 on"
    const spentMatch = /spent\s+INR\s+([0-9,]+(?:\.\d{2})?)\s+on/i.exec(message);
    if (spentMatch?.[1]) {
      const val = parseFloat(spentMatch[1].replace(/,/g, ""));
      if (isFinite(val)) return val;
    }

    // "INR 1,017.70 spent"
    const altMatch = /INR\s+([0-9,]+(?:\.\d{2})?)\s+spent/i.exec(message);
    if (altMatch?.[1]) {
      const val = parseFloat(altMatch[1].replace(/,/g, ""));
      if (isFinite(val)) return val;
    }

    return super.extractAmount(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    // "at VOUCHER PLAT on 20 August"
    const atOnMatch = /at\s+([^•\n]+?)\s+on\s+\d{1,2}\s+\w+/i.exec(message);
    if (atOnMatch?.[1]) {
      const merchant = this.cleanMerchantName(atOnMatch[1].trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    return super.extractMerchant(message, sender);
  }

  protected override extractAccountLast4(message: string): string | null {
    // "AMEX card ** 91000" — take last 4 of the trailing digits
    const cardMatch = /AMEX\s+card\s+\*+\s*(\d+)/i.exec(message);
    if (cardMatch?.[1]) {
      const num = cardMatch[1];
      return num.length >= 4 ? num.slice(-4) : num;
    }

    // "card ending 1234"
    const endingMatch = /card\s+ending\s+(\d{4})/i.exec(message);
    if (endingMatch?.[1]) return endingMatch[1];

    return super.extractAccountLast4(message);
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();

    if (
      lower.includes("offer") ||
      lower.includes("reward") ||
      lower.includes("membership") ||
      lower.includes("statement") ||
      lower.includes("due date")
    ) {
      return false;
    }

    return super.isTransactionMessage(message);
  }
}
