// Exact 1:1 port of OneCardParser.kt from Cashiro parser-core
import { BankParser } from "../base-parser.js";
import type { TransactionType } from "../types.js";

export class OneCardParser extends BankParser {
  getBankName(): string {
    return "OneCard";
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return u.includes("ONECRD") || u.includes("ONECAD") || u.includes("ONECARD");
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();

    // Negative filters
    if (lower.includes("otp")) return false;
    if (lower.includes("pin")) return false;
    if (lower.includes("password")) return false;
    if (lower.includes("block")) return false;

    // Positive keywords specific to OneCard
    if (lower.includes("onecard")) return true;
    if (lower.includes("avl limit")) return true;
    if (lower.includes("avl lmt")) return true;
    if (lower.includes("available limit")) return true;

    return super.isTransactionMessage(message);
  }

  protected override extractTransactionType(_message: string): TransactionType | null {
    // OneCard is a credit card — all spend transactions are CREDIT type
    return "CREDIT";
  }

  protected override extractAmount(message: string): number | null {
    // "Rs.500.00" / "Rs.1,234.56" / "Rs 500" patterns
    const rsPattern = /(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (rsPattern?.[1]) {
      const val = parseFloat((rsPattern[1] ?? "").replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }
    return super.extractAmount(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    // "at MERCHANT on DD" or "at MERCHANT." or "at MERCHANT NAME on"
    const atMerchantMatch = /\bat\s+([A-Za-z0-9][^.]+?)\s+on\s+\d/i.exec(message);
    if (atMerchantMatch?.[1]) {
      const m = this.cleanMerchantName((atMerchantMatch[1] ?? "").trim());
      if (this.isValidMerchantName(m)) return m;
    }

    // "at MERCHANT." (end of sentence)
    const atMerchantDotMatch = /\bat\s+([A-Za-z0-9][^.]+?)\./i.exec(message);
    if (atMerchantDotMatch?.[1]) {
      const m = this.cleanMerchantName((atMerchantDotMatch[1] ?? "").trim());
      if (this.isValidMerchantName(m)) return m;
    }

    // "at MERCHANT NAME" at end of message
    const atMerchantEndMatch = /\bat\s+([A-Za-z0-9][^.]+?)(?:\s*$)/i.exec(message);
    if (atMerchantEndMatch?.[1]) {
      const m = this.cleanMerchantName((atMerchantEndMatch[1] ?? "").trim());
      if (this.isValidMerchantName(m)) return m;
    }

    return super.extractMerchant(message, sender);
  }

  protected override extractAccountLast4(message: string): string | null {
    // "OneCard ending XXXX" — "ending" followed by 4 digits
    const endingMatch = /ending\s+([Xx*]*\d{4})/i.exec(message);
    if (endingMatch?.[1]) {
      const digits = (endingMatch[1] ?? "").replace(/\D/g, "");
      return digits.length >= 4 ? digits.slice(-4) : null;
    }

    // "OneCard XX1234" or "OneCard XXXX1234" — masked digits then 4 digits
    const oneCardMaskedMatch = /OneCard\s+[Xx*]+(\d{4})/i.exec(message);
    if (oneCardMaskedMatch?.[1]) {
      return oneCardMaskedMatch[1] ?? null;
    }

    // "OneCard XXXX" — just the 4 digits without preceding mask
    const oneCardDigitsMatch = /OneCard\s+(\d{4})\b/i.exec(message);
    if (oneCardDigitsMatch?.[1]) {
      return oneCardDigitsMatch[1] ?? null;
    }

    return super.extractAccountLast4(message);
  }

  protected override extractAvailableLimit(message: string): number | null {
    const patterns = [
      /Avl\s+Limit\s*:\s*Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
      /Avl\s+Lmt\s*Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
      /Avl\s+Lmt\s*:\s*Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
      /Available\s+Limit\s*:\s*Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
      /Available\s+Limit\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
    ];
    for (const pattern of patterns) {
      const match = pattern.exec(message);
      if (match?.[1]) {
        const val = parseFloat((match[1] ?? "").replace(/,/g, ""));
        if (!isNaN(val)) return val;
      }
    }
    return super.extractAvailableLimit(message);
  }
}
