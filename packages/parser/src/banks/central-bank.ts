// Exact 1:1 port of CentralBankOfIndiaParser.kt from Cashiro parser-core
import { BankParser } from '../base-parser.js';
import type { TransactionType } from '../types.js';

function parseNum(str: string): number | null {
  const n = parseFloat(str.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export class CentralBankOfIndiaParser extends BankParser {
  getBankName(): string {
    return 'Central Bank of India';
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      u.includes('CENTBK') ||
      u.includes('CBOI') ||
      u.includes('CENTRALBANK') ||
      u.includes('CENTRAL') ||
      /^[A-Z]{2}-CENTBK-[A-Z]$/.test(u) ||
      /^[A-Z]{2}-CBOI-[A-Z]$/.test(u)
    );
  }

  protected override extractAmount(message: string): number | null {
    // Pattern 1: Credited by Rs.50.00 / Debited by Rs.100.50
    const p1 = /(?:Credited|Debited)\s+by\s+Rs\.?\s*([\d,]+(?:\.\d{2})?)/i.exec(message);
    if (p1?.[1]) {
      const val = parseNum(p1[1]);
      if (val !== null) return val;
    }

    // Pattern 2: Rs.XXX credited/debited
    const p2 = /Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+(?:credited|debited)/i.exec(message);
    if (p2?.[1]) {
      const val = parseNum(p2[1]);
      if (val !== null) return val;
    }

    return super.extractAmount(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    // Pattern 1: "from [NAME]" for credits
    const fromMatch = /from\s+([A-Z0-9]+|[^\s]+?)(?:\s+via|\s+Ref|\s+\.|$)/i.exec(message);
    if (fromMatch?.[1]) {
      const merchant = fromMatch[1].trim();
      // Handle masked UPI IDs
      if (merchant.toUpperCase().includes('X')) {
        return 'UPI Transfer';
      }
      return this.cleanMerchantName(merchant);
    }

    // Pattern 2: "to [NAME]" for debits
    const toMatch = /to\s+([^\s]+?)(?:\s+via|\s+Ref|\s+\.|$)/i.exec(message);
    if (toMatch?.[1]) {
      const merchant = this.cleanMerchantName(toMatch[1].trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    // Pattern 3: via UPI
    if (/via UPI/i.test(message)) {
      const lower = message.toLowerCase();
      if (lower.includes('credited')) return 'UPI Credit';
      if (lower.includes('debited')) return 'UPI Payment';
    }

    return super.extractMerchant(message, sender);
  }

  protected override extractAccountLast4(message: string): string | null {
    // Pattern 1: account XX3113 (last 4 visible)
    const p1 = /account\s+[X*]*(\d{4})/i.exec(message);
    if (p1?.[1]) return p1[1];

    // Pattern 2: A/C ending XXXX
    const p2 = /A\/C\s+ending\s+[X*]*(\d{4})/i.exec(message);
    if (p2?.[1]) return p2[1];

    return super.extractAccountLast4(message);
  }

  protected override extractBalance(message: string): number | null {
    // Pattern 1: Total Bal Rs.0000.99 CR/DR
    const totalBalMatch = /Total\s+Bal\s+Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+(CR|DR)/i.exec(message);
    if (totalBalMatch?.[1] && totalBalMatch?.[2]) {
      const balStr = totalBalMatch[1].replace(/,/g, '');
      const val = parseFloat(balStr);
      if (!isNaN(val)) {
        return totalBalMatch[2].toUpperCase() === 'DR' ? -val : val;
      }
    }

    // Pattern 2: Clear Bal Rs.XXX CR/DR
    const clearBalMatch = /Clear\s+Bal\s+Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+(CR|DR)/i.exec(message);
    if (clearBalMatch?.[1] && clearBalMatch?.[2]) {
      const balStr = clearBalMatch[1].replace(/,/g, '');
      const val = parseFloat(balStr);
      if (!isNaN(val)) {
        return clearBalMatch[2].toUpperCase() === 'DR' ? -val : val;
      }
    }

    return super.extractBalance(message);
  }

  protected override extractReference(message: string): string | null {
    // Pattern: Ref No.541986000003
    const p = /Ref\s+No\.?\s*(\w+)/i.exec(message);
    if (p?.[1]) return p[1];
    return super.extractReference(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();
    if (lower.includes('credited')) return 'INCOME';
    if (lower.includes('deposited')) return 'INCOME';
    if (lower.includes('received')) return 'INCOME';
    if (lower.includes('debited')) return 'EXPENSE';
    if (lower.includes('withdrawn')) return 'EXPENSE';
    if (lower.includes('paid')) return 'EXPENSE';
    return super.extractTransactionType(message);
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();

    // CBoI-specific: "credited by" or "debited by" combined with "bal"
    if (
      (lower.includes('credited by') || lower.includes('debited by')) &&
      lower.includes('bal')
    ) {
      return true;
    }

    // CBoI signature suffix
    if (lower.includes('-cboi')) {
      return lower.includes('credited') || lower.includes('debited');
    }

    return super.isTransactionMessage(message);
  }
}
