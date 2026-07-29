// 1:1 port of BandhanBankParser from Cashiro parser-core
import { BankParser } from '../base-parser.js';
import type { TransactionType } from '../types.js';

export class BandhanBankParser extends BankParser {
  getBankName(): string {
    return 'Bandhan Bank';
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      u.includes('BANBNK') ||
      u.includes('BNDBNK') ||
      u.includes('BANDHAN')
    );
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();
    // Negative filters
    if (lower.includes('otp')) return false;
    if (lower.includes('password')) return false;
    if (lower.includes('pin')) return false;
    // Positive: debited/credited + account or bandhan context
    const hasDebitCredit = lower.includes('debited') || lower.includes('credited');
    const hasBankContext = lower.includes('a/c') || lower.includes('bandhan');
    if (hasDebitCredit && hasBankContext) return true;
    return super.isTransactionMessage(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();
    if (lower.includes('debited')) return 'EXPENSE';
    if (lower.includes('credited')) return 'INCOME';
    return super.extractTransactionType(message);
  }

  protected override extractAmount(message: string): number | null {
    // "is debited by Rs.500.00" or "is credited with Rs.2,000.00"
    const debitByMatch = /debited\s+by\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (debitByMatch?.[1]) {
      const val = parseFloat((debitByMatch[1] ?? '').replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    // "credited with Rs.2,000.00"
    const creditWithMatch = /credited\s+with\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (creditWithMatch?.[1]) {
      const val = parseFloat((creditWithMatch[1] ?? '').replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    // "Rs.1,000.00 credited to"
    const rsCreditedMatch = /Rs\.?\s*([0-9,]+(?:\.\d{2})?)\s+credited/i.exec(message);
    if (rsCreditedMatch?.[1]) {
      const val = parseFloat((rsCreditedMatch[1] ?? '').replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    // "INR 250 debited from"
    const inrDebitMatch = /INR\s+([0-9,]+(?:\.\d{2})?)\s+debited/i.exec(message);
    if (inrDebitMatch?.[1]) {
      const val = parseFloat((inrDebitMatch[1] ?? '').replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    return super.extractAmount(message);
  }

  protected override extractAccountLast4(message: string): string | null {
    // "A/c XXXX1234" or "a/c XX9012"
    const acMatch = /[Aa]\/[Cc]\s+[X*]*(\d+)/i.exec(message);
    if (acMatch?.[1]) {
      const d = (acMatch[1] ?? '').replace(/\D/g, '');
      const last4 = d.slice(-4);
      if (last4.length >= 3) return last4;
    }

    // "a/c ending 1234"
    const endingMatch = /[Aa]\/[Cc]\s+ending\s+(\d+)/i.exec(message);
    if (endingMatch?.[1]) {
      const d = (endingMatch[1] ?? '').replace(/\D/g, '');
      const last4 = d.slice(-4);
      if (last4.length >= 3) return last4;
    }

    return super.extractAccountLast4(message);
  }

  protected override extractBalance(message: string): number | null {
    // "Available Balance: Rs.1,500.00"
    const availBalMatch = /Available\s+Balance\s*:?\s*Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (availBalMatch?.[1]) {
      const val = parseFloat((availBalMatch[1] ?? '').replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    // "Bal: Rs.5,000.00" or "Bal Rs.750.00"
    const balMatch = /Bal\s*:?\s*Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (balMatch?.[1]) {
      const val = parseFloat((balMatch[1] ?? '').replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    // "Balance: Rs.xxx"
    const balanceMatch = /Balance\s*:?\s*Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (balanceMatch?.[1]) {
      const val = parseFloat((balanceMatch[1] ?? '').replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    return super.extractBalance(message);
  }

  protected override extractReference(message: string): string | null {
    // "UPI Ref: 123456789012"
    const upiRefMatch = /UPI\s+Ref\s*:?\s*([A-Za-z0-9]+)/i.exec(message);
    if (upiRefMatch?.[1]) return upiRefMatch[1] ?? null;

    // "Ref No 123456"
    const refNoMatch = /Ref\s+No\.?\s*([A-Za-z0-9]+)/i.exec(message);
    if (refNoMatch?.[1]) return refNoMatch[1] ?? null;

    // "Ref: XXXX"
    const refMatch = /Ref\s*:\s*([A-Za-z0-9]+)/i.exec(message);
    if (refMatch?.[1]) return refMatch[1] ?? null;

    return super.extractReference(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    // "from JOHN DOE via UPI"
    const fromViaUpiMatch = /from\s+([^.\n]+?)\s+via\s+UPI/i.exec(message);
    if (fromViaUpiMatch?.[1]) {
      const m = this.cleanMerchantName((fromViaUpiMatch[1] ?? '').trim());
      if (this.isValidMerchantName(m)) return m;
    }

    return super.extractMerchant(message, sender);
  }
}
