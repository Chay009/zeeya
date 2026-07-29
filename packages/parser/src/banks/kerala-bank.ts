// Exact 1:1 port of KeralaBankParser.kt from Cashiro parser-core
import { BankParser } from '../base-parser.js';
import type { TransactionType } from '../types.js';

function parseNum(str: string): number | null {
  const n = parseFloat(str.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export class KeralaBankParser extends BankParser {
  getBankName(): string {
    return 'Kerala Bank';
  }

  override getCurrency(): string {
    return 'INR';
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      u.includes('KRLBNK') ||
      u.includes('KERBNK') ||
      u.includes('KERALAB') ||
      u.includes('KERALABANK')
    );
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();

    // Negative filters
    if (lower.includes('otp')) return false;
    if (lower.includes('password')) return false;
    if (lower.includes('pin')) return false;

    // Positive: transaction keywords combined with bank/account context
    const hasDebitCredit =
      lower.includes('debited') || lower.includes('credited');

    const hasBankContext =
      lower.includes('kerala bank') ||
      lower.includes('a/c') ||
      lower.includes('a/c no');

    if (hasDebitCredit && hasBankContext) return true;

    // Also allow plain debit/credit keywords that the base class handles
    return super.isTransactionMessage(message);
  }

  protected override extractAmount(message: string): number | null {
    // Pattern 1: "debited Rs.500.00" or "debited with INR 250.00"
    const debitMatch =
      /debited\s+(?:with\s+)?(?:Rs\.?|INR)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i.exec(message);
    if (debitMatch?.[1]) {
      const val = parseNum(debitMatch[1]);
      if (val !== null) return val;
    }

    // Pattern 2: "Rs.1000 credited to" or "credited by Rs.2000"
    const creditedToMatch =
      /(?:Rs\.?|INR)\s*([0-9,]+(?:\.[0-9]{1,2})?)\s+credited\s+to/i.exec(message);
    if (creditedToMatch?.[1]) {
      const val = parseNum(creditedToMatch[1]);
      if (val !== null) return val;
    }

    const creditedByMatch =
      /credited\s+by\s+(?:Rs\.?|INR)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i.exec(message);
    if (creditedByMatch?.[1]) {
      const val = parseNum(creditedByMatch[1]);
      if (val !== null) return val;
    }

    // Fallback: generic Rs./INR pattern
    const genericMatch =
      /(?:Rs\.?|INR)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i.exec(message);
    if (genericMatch?.[1]) {
      const val = parseNum(genericMatch[1]);
      if (val !== null) return val;
    }

    return super.extractAmount(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();

    if (lower.includes('debited')) return 'EXPENSE';
    if (lower.includes('credited')) return 'INCOME';

    return null;
  }

  protected override extractMerchant(message: string, _sender: string): string | null {
    // "From: JOHN DOE via IMPS" or "From: merchantname via UPI"
    const fromViaMatch = /From:\s*([^.]+?)\s+via\s+(?:IMPS|UPI|NEFT|RTGS)/i.exec(message);
    if (fromViaMatch?.[1]) {
      const merchant = fromViaMatch[1].trim();
      if (merchant.length > 0) return this.cleanMerchantName(merchant);
    }

    // "via UPI" → generic UPI Payment for debits without a named sender
    if (/via\s+UPI/i.test(message)) {
      return 'UPI Payment';
    }

    // "via IMPS" → IMPS Transfer
    if (/via\s+IMPS/i.test(message)) {
      return 'IMPS Transfer';
    }

    return null;
  }

  protected override extractReference(message: string): string | null {
    // "Ref: 123456789" or "UPI Ref: 123456789"
    const refMatch = /(?:UPI\s+)?Ref(?:erence)?[:\s]+([A-Z0-9]+)/i.exec(message);
    if (refMatch?.[1]) {
      return refMatch[1].trim();
    }

    return super.extractReference(message);
  }

  protected override extractAccountLast4(message: string): string | null {
    // "A/c XXXX1234" or "A/c No XX1234"
    const acMatch = /A\/c\s+(?:No\.?\s+)?(?:X+)(\d{3,6})/i.exec(message);
    if (acMatch?.[1]) {
      const digits = acMatch[1];
      if (digits.length >= 4) return digits.slice(-4);
      return digits.padStart(4, '0');
    }

    return super.extractAccountLast4(message);
  }

  protected override extractBalance(message: string): number | null {
    const balancePatterns = [
      // "Avl Bal: Rs.1500.00"
      /Avl\s+Bal[:\s]*Rs\.?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
      // "Balance Rs.3000.00"
      /Balance\s+Rs\.?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
      // "Bal Rs.750" or "Bal: Rs.750"
      /Bal[:\s]+Rs\.?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
      // "Available Balance: Rs.XXXX"
      /Available\s+Balance[:\s]*Rs\.?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    ];

    for (const pattern of balancePatterns) {
      const m = pattern.exec(message);
      if (m?.[1]) {
        const val = parseNum(m[1]);
        if (val !== null) return val;
      }
    }

    return super.extractBalance(message);
  }
}
