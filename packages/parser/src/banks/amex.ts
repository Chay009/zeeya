// Exact 1:1 port of AMEXBankParser.kt from Cashiro parser-core
import { BankParser } from '../base-parser.js';
import type { TransactionType } from '../types.js';

export class AMEXBankParser extends BankParser {
  getBankName(): string {
    return 'American Express';
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return u.includes('AMEX');
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();

    // Negative filters
    if (lower.includes('otp')) return false;
    if (lower.includes('password')) return false;
    if (lower.includes('pin')) return false;

    // AMEX-specific positive keywords
    if (lower.includes('spent on amex')) return true;
    if (lower.includes('charged on')) return true;
    if (lower.includes('amex card')) return true;
    if (lower.includes('american express card')) return true;
    if (lower.includes('has been used for')) return true;

    return super.isTransactionMessage(message);
  }

  protected override extractTransactionType(_message: string): TransactionType | null {
    // All AMEX transactions are credit card spends
    return 'CREDIT';
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    // Pattern 1: "Merchant: MERCHANT NAME." (explicit merchant label)
    const merchantLabelMatch = /Merchant:\s*([^.\n]+)/i.exec(message);
    if (merchantLabelMatch?.[1]) {
      const m = this.cleanMerchantName((merchantLabelMatch[1] ?? '').trim());
      if (this.isValidMerchantName(m)) return m;
    }

    // Pattern 2: "at MERCHANT on DD..." (standard card format with date following)
    const atOnMatch = /at\s+([^.]+?)\s+on\s+\d/i.exec(message);
    if (atOnMatch?.[1]) {
      const m = this.cleanMerchantName((atOnMatch[1] ?? '').trim());
      if (this.isValidMerchantName(m)) return m;
    }

    // Pattern 3: "at MERCHANT." (card format ending in period or end of string)
    const atPeriodMatch = /at\s+([^.\n]+?)(?:\.|$)/i.exec(message);
    if (atPeriodMatch?.[1]) {
      const m = this.cleanMerchantName((atPeriodMatch[1] ?? '').trim());
      if (this.isValidMerchantName(m)) return m;
    }

    return super.extractMerchant(message, sender);
  }

  protected override extractAccountLast4(message: string): string | null {
    // Pattern 1: "ending 1234" or "ending XXXX"
    const endingMatch = /ending\s+([X*\d]{1,4})/i.exec(message);
    if (endingMatch?.[1]) {
      const raw = endingMatch[1] ?? '';
      const digits = raw.replace(/\D/g, '');
      if (digits.length >= 3) return digits.slice(-4).padStart(4, '0');
      // If it's all X's or short, try to get the trailing 4-digit block separately
    }

    // Pattern 2: "Card XXXX1234" – captures trailing digits after mask
    const cardMaskedMatch = /Card\s+[X*]+(\d{4})/i.exec(message);
    if (cardMaskedMatch?.[1]) {
      return cardMaskedMatch[1] ?? null;
    }

    return super.extractAccountLast4(message);
  }

  protected override extractAvailableLimit(message: string): number | null {
    // Pattern 1: "Available Credit: Rs.XXXXX" or "Available Credit: INR XXXXX"
    const availCreditMatch =
      /Available\s+Credit:\s*(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (availCreditMatch?.[1]) {
      const val = parseFloat((availCreditMatch[1] ?? '').replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    // Pattern 2: "Avl Cr Limit: Rs.XXXXX" or "Avl Cr Limit: INR XXXXX"
    const avlCrMatch =
      /Avl\s+Cr\s+Limit:\s*(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (avlCrMatch?.[1]) {
      const val = parseFloat((avlCrMatch[1] ?? '').replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    return super.extractAvailableLimit(message);
  }
}
