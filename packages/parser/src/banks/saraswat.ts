// Exact 1:1 port of SaraswatBankParser.kt from Cashiro parser-core
import { BankParser } from '../base-parser.js';
import type { TransactionType } from '../types.js';

function parseNum(str: string): number | null {
  const n = parseFloat(str.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export class SaraswatBankParser extends BankParser {
  getBankName(): string {
    return 'Saraswat Co-operative Bank';
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    const saraswatSenders = new Set(['SARBNK', 'SARASWAT', 'SARASWATBANK']);
    if (saraswatSenders.has(u)) return true;
    return (
      /^[A-Z]{2}-SARBNK-[ST]$/.test(u) ||
      /^[A-Z]{2}-SARASWAT-[ST]$/.test(u) ||
      /^[A-Z]{2}-SARBNK$/.test(u) ||
      /^[A-Z]{2}-SARASWAT$/.test(u)
    );
  }

  protected override extractAmount(message: string): number | null {
    // Pattern 1: "INR 115.50" or "INR 10,000.00"
    const inrMatch = /INR\s+(\d+(?:,\d{3})*(?:\.\d{2})?)/i.exec(message);
    if (inrMatch?.[1]) {
      const val = parseNum(inrMatch[1]);
      if (val !== null) return val;
    }

    // Pattern 2: Rs. format
    const rsMatch = /Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i.exec(message);
    if (rsMatch?.[1]) {
      const val = parseNum(rsMatch[1]);
      if (val !== null) return val;
    }

    return super.extractAmount(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();
    if (lower.includes('is credited')) return 'INCOME';
    if (lower.includes('credited with')) return 'INCOME';
    if (lower.includes('is debited')) return 'EXPENSE';
    if (lower.includes('debited with')) return 'EXPENSE';
    if (lower.includes('withdrawn')) return 'EXPENSE';
    return super.extractTransactionType(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    // Pattern 1: "towards ACH Credit:GUJARAT GAS LIMITED" or "towards Salary"
    const towardsMatch = /towards\s+(.+?)(?:\.\s*Current|\s*Current|$)/i.exec(message);
    if (towardsMatch?.[1]) {
      const merchant = towardsMatch[1].trim();
      const cleanedMerchant = merchant
        .replace(/^ACH\s+Credit:\s*/i, '')
        .replace(/^ACH\s+Debit:\s*/i, '')
        .trim();
      if (this.isValidMerchantName(cleanedMerchant)) {
        return this.cleanMerchantName(cleanedMerchant);
      }
    }

    // Pattern 2: "for S.I." or "for NEFT" etc.
    const forMatch = /for\s+([A-Za-z.]+?)(?:\.\s+Current|\s+Current|$)/i.exec(message);
    if (forMatch?.[1]) {
      const merchant = forMatch[1].trim().replace(/\.$/, '');
      switch (merchant.toUpperCase()) {
        case 'S.I': return 'Standing Instruction';
        case 'SI': return 'Standing Instruction';
        case 'NEFT': return 'NEFT Transfer';
        case 'RTGS': return 'RTGS Transfer';
        case 'IMPS': return 'IMPS Transfer';
        default: return merchant;
      }
    }

    // Pattern 3: ATM withdrawal
    if (/ATM/i.test(message) || /withdrawn/i.test(message)) {
      return 'ATM Withdrawal';
    }

    return super.extractMerchant(message, sender);
  }

  protected override extractAccountLast4(message: string): string | null {
    // Pattern 1: "A/c no. 013460" or "A/c no. ending with 013460"
    const accountNoMatch = /A\/c\s+no\.\s+(?:ending\s+with\s+)?(\d{4,6})/i.exec(message);
    if (accountNoMatch?.[1]) {
      return accountNoMatch[1].slice(-4);
    }

    // Pattern 2: "account no. ending with 013460"
    const endingWithMatch = /account\s+no\.\s+ending\s+with\s+(\d{4,6})/i.exec(message);
    if (endingWithMatch?.[1]) {
      return endingWithMatch[1].slice(-4);
    }

    // Pattern 3: "A/c *1234"
    const starMatch = /A\/c\s+\*(\d{4})/i.exec(message);
    if (starMatch?.[1]) {
      return starMatch[1];
    }

    return super.extractAccountLast4(message);
  }

  protected override extractBalance(message: string): number | null {
    // Pattern 1: "Current Bal is INR 941.23 CR" or "Current Bal is INR 8,256.97CR"
    const currentBalMatch = /Current\s+Bal\s+is\s+INR\s+(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:CR|DR)?/i.exec(message);
    if (currentBalMatch?.[1]) {
      const val = parseNum(currentBalMatch[1]);
      if (val !== null) return val;
    }

    // Pattern 2: "Bal: Rs. 1000.00"
    const balMatch = /Bal[:\s]+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i.exec(message);
    if (balMatch?.[1]) {
      const val = parseNum(balMatch[1]);
      if (val !== null) return val;
    }

    return super.extractBalance(message);
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();

    // Skip OTP and verification messages
    if (
      lower.includes('otp') ||
      lower.includes('one time password') ||
      lower.includes('verification code')
    ) {
      return false;
    }

    // Saraswat Bank specific transaction keywords
    const saraswatKeywords = [
      'is credited with',
      'is debited with',
      'credited with inr',
      'debited with inr',
      'current bal is',
    ];

    if (saraswatKeywords.some(kw => lower.includes(kw))) return true;

    return super.isTransactionMessage(message);
  }
}
