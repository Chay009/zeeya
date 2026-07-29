// Exact 1:1 port of EquitasBankParser.kt from Cashiro parser-core
import { BankParser } from '../base-parser.js';
import type { TransactionType } from '../types.js';

function parseNum(str: string): number | null {
  const n = parseFloat(str.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export class EquitasBankParser extends BankParser {
  getBankName(): string {
    return 'Equitas Small Finance Bank';
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return u.includes('EQBNK') || u.includes('EQUBNK') || u.includes('EQUITAS');
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();

    // Negative filters
    if (lower.includes('otp') || lower.includes('password')) return false;

    // Positive: transaction keywords with equitas/a/c context
    if (
      (lower.includes('debited') || lower.includes('credited') || lower.includes('spent')) &&
      (lower.includes('equitas') || lower.includes('a/c') || lower.includes('account') || lower.includes('card'))
    ) {
      return true;
    }

    // Credit card txn format: "Txn of INR X on Equitas CC..."
    if (lower.includes('txn of') && (lower.includes('equitas') || lower.includes(' cc '))) {
      return true;
    }

    // Available limit messages are credit card transactions
    if (lower.includes('avl lmt') || lower.includes('avl cr lmt') || lower.includes('available limit')) {
      return true;
    }

    return super.isTransactionMessage(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();

    // Credit card detection — check before debit/credit
    if (
      lower.includes('credit card') ||
      lower.includes(' cc ') ||
      lower.includes('avl lmt') ||
      lower.includes('avl cr lmt') ||
      lower.includes('available limit') ||
      lower.includes('avl limit')
    ) {
      return 'CREDIT';
    }

    if (lower.includes('credited')) return 'INCOME';
    if (lower.includes('debited') || lower.includes('spent') || lower.includes('txn of')) return 'EXPENSE';
    return super.extractTransactionType(message);
  }

  protected override extractAmount(message: string): number | null {
    const patterns = [
      /Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+(?:debited|credited|spent)/i,
      /(?:debited|credited|spent)\s+(?:by\s+|for\s+)?Rs\.?\s*([\d,]+(?:\.\d{2})?)/i,
      /[Tt]xn\s+of\s+(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{2})?)/i,
      /(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{2})?)\s+(?:debited|credited|spent)/i,
      /(?:debited|credited|spent)\s+(?:by\s+)?INR\s*([\d,]+(?:\.\d{2})?)/i,
      /[Dd]ebited\s+by\s+INR\s*([\d,]+(?:\.\d{2})?)/i,
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

  protected override extractAccountLast4(message: string): string | null {
    const patterns = [
      /[Aa]\/[Cc]\s*(?:[Nn]o\.?)?\s*(?:[Xx*]+)?(\d{3,4})\b/,
      /[Aa]\/[Cc]\s+ending\s+(\d{3,4})\b/i,
      /[Aa]ccount\s+ending\s+(\d{3,4})\b/i,
      /[Ee]nding\s+(\d{3,4})\b/i,
      /[Cc]ard\s+(?:[Xx*]+)?(\d{3,4})\b/i,
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
      /[Aa]vl\s+[Bb]al(?:ance)?\s*[:\s]+Rs\.?\s*([\d,]+(?:\.\d{2})?)/i,
      /[Bb]al(?:ance)?\s*[:\s]+Rs\.?\s*([\d,]+(?:\.\d{2})?)/i,
      /[Bb]alance\s*[:\s]+([\d,]+(?:\.\d{2})?)/i,
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

  protected override extractAvailableLimit(message: string): number | null {
    const patterns = [
      /[Aa]vl\s+[Cc]r\s+[Ll]mt\s*[:\s]+Rs\.?\s*([\d,]+(?:\.\d{2})?)/i,
      /[Aa]vl\s+[Ll]mt\s*[:\s]+Rs\.?\s*([\d,]+(?:\.\d{2})?)/i,
      /[Aa]vailable\s+[Ll]imit\s*[:\s]+Rs\.?\s*([\d,]+(?:\.\d{2})?)/i,
      /[Aa]vl\s+[Ll]imit\s*[:\s]+Rs\.?\s*([\d,]+(?:\.\d{2})?)/i,
    ];
    for (const pattern of patterns) {
      const m = pattern.exec(message);
      if (m?.[1]) {
        const val = parseNum(m[1]);
        if (val !== null) return val;
      }
    }
    return super.extractAvailableLimit(message);
  }

  protected override extractReference(message: string): string | null {
    const patterns = [
      /[Uu]PI\s+[Rr]ef\s*(?:[Nn]o\.?)?\s*[:\s]*(\d+)/i,
      /[Rr]ef\s*(?:[Nn]o\.?|#)?\s*[:\s]*([A-Z0-9]{6,})/i,
      /[Tt]xn\s+[Ii][Dd]\s*[:\s]*([A-Z0-9]+)/i,
    ];
    for (const pattern of patterns) {
      const m = pattern.exec(message);
      if (m?.[1]) return m[1];
    }
    return super.extractReference(message);
  }
}
