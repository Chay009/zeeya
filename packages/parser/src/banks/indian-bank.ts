// Exact 1:1 port of IndianBankParser.kt from Cashiro parser-core
import { BankParser } from '../base-parser.js';
import type { TransactionType, MandateInfo } from '../types.js';

function parseNum(str: string): number | null {
  const n = parseFloat(str.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export interface IndianMandateInfo extends MandateInfo {
  dateFormat: 'd-MMM-yy';
}

/**
 * Parser for Indian Bank
 *
 * Common sender patterns:
 * - Service Implicit (transactions): XX-INDBNK-S (e.g., AD-INDBNK-S, AX-INDBNK-S)
 * - OTP: XX-INDBNK-T
 * - Promotional: XX-INDBNK-P
 * - Direct: INDBNK, INDIAN
 */
export class IndianBankParser extends BankParser {
  getBankName(): string {
    return 'Indian Bank';
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      u.includes('INDIAN BANK') ||
      u.includes('INDIANBANK') ||
      u.includes('INDIANBK') ||
      // Match DLT patterns for transactions (-S suffix)
      /^[A-Z]{2}-INDBNK-S$/.test(u) ||
      // Also handle other patterns for completeness
      /^[A-Z]{2}-INDBNK-[TPG]$/.test(u) ||
      // Legacy patterns without suffix
      /^[A-Z]{2}-INDBNK$/.test(u) ||
      // Direct sender IDs
      u === 'INDBNK' ||
      u === 'INDIAN'
    );
  }

  protected override extractAmount(message: string): number | null {
    // Pattern 1: debited Rs. 19000.00
    const debitMatch = /debited\s+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i.exec(message);
    if (debitMatch?.[1]) {
      const val = parseNum(debitMatch[1]);
      if (val !== null) return val;
    }

    // Pattern 2: credited Rs. 5000.00
    const creditMatch = /credited\s+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i.exec(message);
    if (creditMatch?.[1]) {
      const val = parseNum(creditMatch[1]);
      if (val !== null) return val;
    }

    // Pattern 2a: Rs.589.00 credited to (amount before credited)
    const creditReverseMatch = /Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s+credited\s+to/i.exec(message);
    if (creditReverseMatch?.[1]) {
      const val = parseNum(creditReverseMatch[1]);
      if (val !== null) return val;
    }

    // Pattern 3: withdrawn Rs. 2000
    const withdrawnMatch = /withdrawn\s+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i.exec(message);
    if (withdrawnMatch?.[1]) {
      const val = parseNum(withdrawnMatch[1]);
      if (val !== null) return val;
    }

    // Pattern 4: UPI payment of Rs. 500
    const upiMatch = /UPI\s+payment\s+of\s+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i.exec(message);
    if (upiMatch?.[1]) {
      const val = parseNum(upiMatch[1]);
      if (val !== null) return val;
    }

    // Fall back to base class patterns
    return super.extractAmount(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    // Pattern 1: "to Merchant Name"
    const toMatch = /to\s+([^.\n]+?)(?:\.\s*UPI:|UPI:|$)/i.exec(message);
    if (toMatch?.[1]) {
      const merchant = this.cleanMerchantName(toMatch[1].trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    // Pattern 2: "from Sender Name"
    const fromMatch = /from\s+([^.\n]+?)(?:\.\s*UPI:|UPI:|$)/i.exec(message);
    if (fromMatch?.[1]) {
      const merchant = this.cleanMerchantName(fromMatch[1].trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    // Pattern 2a: "linked to VPA 7970282159-2@axl" - extract VPA
    const vpaMatch = /VPA\s+([\w.-]+@[\w]+)/i.exec(message);
    if (vpaMatch?.[1]) {
      const vpa = vpaMatch[1];
      // Extract the part before @ as merchant name
      const merchantFromVpa = vpa.split('@')[0] ?? vpa;
      return this.cleanMerchantName(merchantFromVpa);
    }

    // Pattern 3: ATM withdrawal at location
    const atmMatch = /ATM\s+(?:withdrawal\s+)?at\s+([^.\n]+?)(?:\s+on|$)/i.exec(message);
    if (atmMatch?.[1]) {
      const location = this.cleanMerchantName(atmMatch[1].trim());
      if (this.isValidMerchantName(location)) return `ATM - ${location}`;
    }

    // Fall back to base class patterns
    return super.extractMerchant(message, sender);
  }

  protected override extractAccountLast4(message: string): string | null {
    // Pattern 1: A/c *1234
    const pattern1 = /A\/c\s+\*(\d{4})/i.exec(message);
    if (pattern1?.[1]) return pattern1[1];

    // Pattern 2: Account XX1234 or XXXX1234
    const pattern2 = /Account\s+X*(\d{4})/i.exec(message);
    if (pattern2?.[1]) return pattern2[1];

    // Pattern 3: A/c ending 1234
    const pattern3 = /A\/c\s+ending\s+(\d{4})/i.exec(message);
    if (pattern3?.[1]) return pattern3[1];

    // Fall back to base class
    return super.extractAccountLast4(message);
  }

  protected override extractReference(message: string): string | null {
    // Pattern 1: UPI:515314436916
    const upiRefMatch = /UPI:(\d+)/i.exec(message);
    if (upiRefMatch?.[1]) return upiRefMatch[1];

    // Pattern 1a: UPI Ref no 917477824021
    const upiRefNoMatch = /UPI\s+Ref\s+no\s+(\d+)/i.exec(message);
    if (upiRefNoMatch?.[1]) return upiRefNoMatch[1];

    // Pattern 2: Ref No. 123456
    const refNoMatch = /Ref\s+No\.?\s*(\w+)/i.exec(message);
    if (refNoMatch?.[1]) return refNoMatch[1];

    // Pattern 3: Transaction ID: ABC123
    const txnIdMatch = /Transaction\s+ID:?\s*(\w+)/i.exec(message);
    if (txnIdMatch?.[1]) return txnIdMatch[1];

    // Fall back to base class
    return super.extractReference(message);
  }

  protected override extractBalance(message: string): number | null {
    // Pattern 1: Bal Rs. 50000.00
    const balMatch1 = /Bal\s+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i.exec(message);
    if (balMatch1?.[1]) {
      const val = parseNum(balMatch1[1]);
      if (val !== null) return val;
    }

    // Pattern 2: Available Balance: Rs. 25000
    const balMatch2 = /Available\s+Balance:?\s+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i.exec(message);
    if (balMatch2?.[1]) {
      const val = parseNum(balMatch2[1]);
      if (val !== null) return val;
    }

    // Fall back to base class
    return super.extractBalance(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();

    // Indian Bank specific patterns
    if (lower.includes('debited')) return 'EXPENSE';
    if (lower.includes('withdrawn')) return 'EXPENSE';
    if (lower.includes('upi payment') && !lower.includes('received')) return 'EXPENSE';

    if (lower.includes('credited')) return 'INCOME';
    if (lower.includes('deposited')) return 'INCOME';
    if (lower.includes('received')) return 'INCOME';

    // Fall back to base class for other patterns
    return super.extractTransactionType(message);
  }

  /**
   * Checks if the message is a mandate notification.
   * Example: "For the upcoming mandate set for 29-May-25 ,your account will be debited with INR 59.00 towards Spotify India ."
   */
  isMandateNotification(message: string): boolean {
    const lower = message.toLowerCase();
    return (
      lower.includes('mandate') &&
      (lower.includes('upcoming') ||
        lower.includes('set for') ||
        lower.includes('will be debited'))
    );
  }

  /**
   * Parses mandate/subscription information from the message.
   */
  parseMandateSubscription(message: string): IndianMandateInfo | null {
    // Pattern: "For the upcoming mandate set for 29-May-25 ,your account will be debited with INR 59.00 towards Spotify India ."
    const mandatePattern =
      /mandate\s+set\s+for\s+(\d{1,2}-\w{3}-\d{2})\s*,?\s*your\s+account\s+will\s+be\s+debited\s+with\s+INR\s+(\d+(?:\.\d{2})?)\s+towards\s+([^.]+)/i;

    const match = mandatePattern.exec(message);
    if (match) {
      const dateStr = match[1] ?? '';
      const amountStr = match[2] ?? '';
      const merchantStr = match[3] ?? '';
      const amount = parseFloat(amountStr);
      if (!isNaN(amount) && amount > 0) {
        return {
          amount,
          nextDeductionDate: dateStr || null,
          merchant: this.cleanMerchantName(merchantStr.trim()),
          umn: null,
          dateFormat: 'd-MMM-yy',
        };
      }
    }

    return null;
  }
}
