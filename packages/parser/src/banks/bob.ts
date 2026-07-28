// Exact 1:1 port of BankOfBarodaParser.kt from Cashiro parser-core
import { BankParser } from '../base-parser.js';
import type { TransactionType } from '../types.js';

export class BankOfBarodaParser extends BankParser {
  getBankName(): string {
    return 'Bank of Baroda';
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      u.includes('BARODA') ||
      u.includes('BOBSMS') ||
      u.includes('BOBTXN') ||
      u.includes('BOBCRD') ||
      /(^|[-_])BOB([-_]|$)/.test(u) ||
      /^[A-Z]{2}-BOBSMS-[A-Z]$/.test(u) ||
      /^[A-Z]{2}-BOBTXN-[A-Z]$/.test(u) ||
      /^[A-Z]{2}-BOB-[A-Z]$/.test(u) ||
      /^[A-Z]{2}-BOBCRD-[A-Z]$/.test(u) ||
      u === 'BOB' ||
      u === 'BANKOFBARODA'
    );
  }

  protected override extractAmount(message: string): number | null {
    const patterns = [
      /ALERT:\s*INR\s*([\d,]+(?:\.\d{2})?)\s+is\s+spent/i,
      /Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+transferred\s+from/i,
      /Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+Dr\.?\s+from/i,
      /credited\s+with\s+INR\s+([\d,]+(?:\.\d{2})?)/i,
      /Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+Credited\s+to/i,
      /Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+.*?Cr\.?\s+to/i,
      /Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+deposited\s+in\s+cash/i,
    ];
    for (const pattern of patterns) {
      const m = pattern.exec(message);
      if (m?.[1]) {
        const val = parseFloat(m[1].replace(/,/g, ''));
        if (!isNaN(val)) return val;
      }
    }
    return super.extractAmount(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    const transferToMatch = /transferred\s+from\s+A\/c\s+[^\s]+\s+to:\s*([^.]+?)(?:\.|$)/i.exec(message);
    if (transferToMatch?.[1]) {
      const raw = (transferToMatch[1].trim().split(/\s+Total\s+Bal/i)[0] ?? '').trim();
      if (raw && this.isValidMerchantName(raw)) return this.cleanMerchantName(raw);
    }

    const upiMatch = /Cr\.?\s+to\s+([^\s]+@[^\s.]+)/i.exec(message);
    if (upiMatch?.[1]) {
      const vpa = upiMatch[1];
      const name = vpa.split('@')[0] ?? '';
      return name === 'redacted' ? 'UPI Payment' : this.cleanMerchantName(name ?? '');
    }

    const impsMatch = /IMPS\/[\d]+\s+by\s+([^.]+?)(?:\s*\.|$)/i.exec(message);
    if (impsMatch?.[1]) {
      const m = this.cleanMerchantName(impsMatch[1].trim());
      if (this.isValidMerchantName(m)) return m;
    }

    const lower = message.toLowerCase();
    if (lower.includes('upi')) {
      if (lower.includes('credited')) return 'UPI Credit';
      if (lower.includes('dr.')) return 'UPI Payment';
    }
    if (lower.includes('imps')) return 'IMPS Transfer';
    if (lower.includes('deposited in cash')) return 'Cash Deposit';

    return super.extractMerchant(message, sender);
  }

  protected override extractAccountLast4(message: string): string | null {
    const m1 = /BOBCARD\s+ending\s+(\d{4})/i.exec(message);
    if (m1?.[1]) return m1[1];

    const m2 = /A\/C\s+X*(\d{6})/i.exec(message);
    if (m2?.[1]) return m2[1].slice(-4);

    const m3 = /A\/c\s+\.+(\d{4})/i.exec(message);
    if (m3?.[1]) return m3[1];

    return super.extractAccountLast4(message);
  }

  protected override extractBalance(message: string): number | null {
    const patterns = [
      /AvlBal:\s*Rs\.?\s*([\d,]+(?:\.\d{2})?)/i,
      /Total\s+Bal:\s*Rs\.?\s*([\d,]+(?:\.\d{2})?)/i,
      /Avlbl\s+Amt:\s*Rs\.?\s*([\d,]+(?:\.\d{2})?)/i,
    ];
    for (const pattern of patterns) {
      const m = pattern.exec(message);
      if (m?.[1]) {
        const val = parseFloat(m[1].replace(/,/g, ''));
        if (!isNaN(val)) return val;
      }
    }
    return super.extractBalance(message);
  }

  protected override extractReference(message: string): string | null {
    const m1 = /Ref:\s*(\d+)/i.exec(message);
    if (m1?.[1]) return m1[1];

    const m2 = /UPI\s+Ref\s+No\s+(\d+)/i.exec(message);
    if (m2?.[1]) return m2[1];

    const m3 = /IMPS\/(\d+)/i.exec(message);
    if (m3?.[1]) return m3[1];

    return super.extractReference(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();
    if (lower.includes('spent on your bobcard')) return 'CREDIT';
    if (lower.includes('bobcard') && lower.includes('spent')) return 'CREDIT';
    if (lower.includes('bobcard') && lower.includes('is spent')) return 'CREDIT';
    if (lower.includes('transferred from')) return 'EXPENSE';
    if (lower.includes('dr.') || lower.includes('debited')) return 'EXPENSE';
    if (lower.includes('cr.') || lower.includes('credited')) return 'INCOME';
    if (lower.includes('deposited')) return 'INCOME';
    return super.extractTransactionType(message);
  }

  protected override extractAvailableLimit(message: string): number | null {
    const m = /Available\s+credit\s+limit\s+is\s+Rs\.?\s*([\d,]+(?:\.\d{2})?)/i.exec(message);
    if (m?.[1]) {
      const val = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }
    return super.extractAvailableLimit(message);
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();
    if (
      lower.includes('dr. from') || lower.includes('cr. to') ||
      lower.includes('credited to a/c') || lower.includes('credited with inr') ||
      lower.includes('deposited in cash') || lower.includes('transferred from') ||
      lower.includes('is spent')
    ) return true;
    return super.isTransactionMessage(message);
  }
}
