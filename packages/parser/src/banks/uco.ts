// Exact 1:1 port of UCOBankParser.kt from Cashiro parser-core
import { BankParser } from '../base-parser.js';
import type { TransactionType } from '../types.js';

function parseNum(str: string): number | null {
  const n = parseFloat(str.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export class UCOBankParser extends BankParser {
  getBankName(): string {
    return 'UCO Bank';
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return u.includes('UCOBNK') || u.includes('UCOBKS') || u.includes('UCOBANK');
  }

  protected override extractAmount(message: string): number | null {
    const patterns = [
      /Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+(?:has\s+been\s+)?debited/i,
      /Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+(?:has\s+been\s+)?credited/i,
      /debited\s+(?:by\s+)?Rs\.?\s*([\d,]+(?:\.\d{2})?)/i,
      /credited\s+(?:with\s+|by\s+)?Rs\.?\s*([\d,]+(?:\.\d{2})?)/i,
      /INR\s*([\d,]+(?:\.\d{2})?)\s+debited/i,
      /INR\s*([\d,]+(?:\.\d{2})?)\s+credited/i,
      /debited\s+(?:by\s+)?INR\s*([\d,]+(?:\.\d{2})?)/i,
    ];
    for (const pattern of patterns) {
      const m = pattern.exec(message);
      if (m?.[1]) {
        const val = parseNum(m[1]);
        if (val !== null) return val;
      }
    }
    return super.extractAmount(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();
    if (lower.includes('credited')) return 'INCOME';
    if (lower.includes('debited')) return 'EXPENSE';
    return super.extractTransactionType(message);
  }

  protected override extractAccountLast4(message: string): string | null {
    const patterns = [
      /[Aa]\/[Cc]\s*(?:[Nn]o\.?)?\s*[Xx*]*(\d{3,4})/i,
      /[Aa]ccount\s*(?:[Nn]o\.?)?\s*[Xx*]*(\d{3,4})/i,
      /UCO\s+[Aa]\/[Cc]\s+[Xx*]*(\d{3,4})/i,
    ];
    for (const pattern of patterns) {
      const m = pattern.exec(message);
      if (m?.[1]) {
        const d = m[1];
        return d.length >= 4 ? d.slice(-4) : d;
      }
    }
    return super.extractAccountLast4(message);
  }

  protected override extractBalance(message: string): number | null {
    const patterns = [
      /[Aa]vl?\s+[Bb]al(?:ance)?\s*[:\s]+Rs\.?\s*([\d,]+(?:\.\d{2})?)/i,
      /[Bb]al(?:ance)?\s*[:\s]+Rs\.?\s*([\d,]+(?:\.\d{2})?)/i,
      /[Bb]alance\s*[:\s]+([\d,]+(?:\.\d{2})?)/i,
      /[Bb]al\s*[:\s]+([\d,]+(?:\.\d{2})?)/i,
    ];
    for (const pattern of patterns) {
      const m = pattern.exec(message);
      if (m?.[1]) {
        const val = parseNum(m[1]);
        if (val !== null) return val;
      }
    }
    return super.extractBalance(message);
  }

  protected override extractReference(message: string): string | null {
    const patterns = [
      /Ref\s+(?:[Nn]o\.?|#)?\s*[:\s]*([A-Z0-9]{6,})/i,
      /UPI\s+Ref\s+(?:[Nn]o\.?)?\s*[:\s]*(\d+)/i,
      /Txn\s+(?:[Ii][Dd]|[Nn]o)\.?\s*[:\s]*([A-Z0-9]+)/i,
    ];
    for (const pattern of patterns) {
      const m = pattern.exec(message);
      if (m?.[1]) return m[1];
    }
    return super.extractReference(message);
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();

    if (lower.includes('otp') || lower.includes('password') || lower.includes('pin')) {
      return false;
    }

    if (
      (lower.includes('debited') || lower.includes('credited')) &&
      (lower.includes('uco') || lower.includes('a/c') || lower.includes('account'))
    ) {
      return true;
    }

    return super.isTransactionMessage(message);
  }
}
