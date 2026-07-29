// Exact 1:1 port of DhanlaxmiBankParser.kt from Cashiro parser-core
import { BankParser } from '../base-parser.js';
import type { TransactionType } from '../types.js';

function parseNum(str: string): number | null {
  const n = parseFloat(str.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export class DhanlaxmiBankParser extends BankParser {
  getBankName(): string {
    return 'Dhanlaxmi Bank';
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      u.includes('DLBBNK') ||
      u.includes('DLBANK') ||
      u.includes('DHANLA') ||
      u.includes('DHANLAXMI')
    );
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();

    // Negative filters
    if (lower.includes('otp')) return false;
    if (lower.includes('password')) return false;
    if (lower.includes('pin')) return false;

    // Positive: debit/credit keywords combined with bank/account context
    const hasDebitCredit =
      lower.includes('debited') || lower.includes('credited');

    const hasBankContext =
      lower.includes('dhanlaxmi') || lower.includes('a/c');

    if (hasDebitCredit && hasBankContext) return true;

    return super.isTransactionMessage(message);
  }

  protected override extractAmount(message: string): number | null {
    // Pattern 1: "debited by Rs.500.00"
    const p1 = /debited\s+by\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (p1?.[1]) {
      const val = parseNum(p1[1]);
      if (val !== null) return val;
    }

    // Pattern 2: "INR 250.00 debited from"
    const p2 = /INR\s+([0-9,]+(?:\.\d{2})?)\s+debited/i.exec(message);
    if (p2?.[1]) {
      const val = parseNum(p2[1]);
      if (val !== null) return val;
    }

    // Pattern 3: "Rs.1,000.00 credited to"
    const p3 = /Rs\.?\s*([0-9,]+(?:\.\d{2})?)\s+credited/i.exec(message);
    if (p3?.[1]) {
      const val = parseNum(p3[1]);
      if (val !== null) return val;
    }

    // Pattern 4: "credited with Rs.2,000.00"
    const p4 = /credited\s+with\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (p4?.[1]) {
      const val = parseNum(p4[1]);
      if (val !== null) return val;
    }

    // Fallback: generic Rs./INR pattern
    const generic = /(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (generic?.[1]) {
      const val = parseNum(generic[1]);
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
    // "From: JOHN via NEFT/IMPS/UPI/RTGS"
    const fromViaMatch = /From:\s*([^.]+?)\s+via\s+(?:IMPS|UPI|NEFT|RTGS)/i.exec(message);
    if (fromViaMatch?.[1]) {
      const merchant = fromViaMatch[1].trim();
      if (merchant.length > 0) return this.cleanMerchantName(merchant);
    }

    // "via UPI" → generic UPI Payment for debits without a named sender
    if (/via\s+UPI/i.test(message)) {
      return 'UPI Payment';
    }

    // "via NEFT" → NEFT Transfer
    if (/via\s+NEFT/i.test(message)) {
      return 'NEFT Transfer';
    }

    // "via IMPS" → IMPS Transfer
    if (/via\s+IMPS/i.test(message)) {
      return 'IMPS Transfer';
    }

    return null;
  }

  protected override extractReference(message: string): string | null {
    // "UPI Ref: 123456789012" or "UPI Ref No: X"
    const upiRefMatch = /UPI\s+Ref(?:\s+No)?[:\s]+([A-Z0-9]+)/i.exec(message);
    if (upiRefMatch?.[1]) {
      return upiRefMatch[1].trim();
    }

    // "Ref: 123456789012" or "Ref No: X"
    const refMatch = /Ref(?:\s+No)?[:\s]+([A-Z0-9]+)/i.exec(message);
    if (refMatch?.[1]) {
      return refMatch[1].trim();
    }

    return super.extractReference(message);
  }

  protected override extractAccountLast4(message: string): string | null {
    // "a/c ending 1234"
    const endingMatch = /a\/c\s+ending\s+(\d{3,6})/i.exec(message);
    if (endingMatch?.[1]) {
      const digits = endingMatch[1];
      return digits.slice(-4);
    }

    // "A/c XXXX1234" or "a/c XX9012"
    const acMatch = /A\/c\s+(?:X+)?(\d{4})/i.exec(message);
    if (acMatch?.[1]) {
      return acMatch[1];
    }

    return super.extractAccountLast4(message);
  }

  protected override extractBalance(message: string): number | null {
    const balancePatterns = [
      // "Available Balance: Rs.1,500.00"
      /Available\s+Balance[:\s]*Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
      // "Balance: Rs.3,000.00"
      /Balance[:\s]+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
      // "Bal: Rs.750.00" or "Bal Rs.750"
      /Bal[:\s]+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
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
