import { BankParser } from '../base-parser.js';
import type { TransactionType } from '../types.js';

const SENDERS = new Set(['UBISMS', 'UNIONB', 'UBIINB', 'UBISBI', 'UNIONBANK']);
const DLT = /^[A-Z]{2}-UBI/;

export class UnionBankParser extends BankParser {
  getBankName() { return 'Union Bank of India'; }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return SENDERS.has(u) || DLT.test(u);
  }

  protected isTransactionMessage(body: string): boolean {
    // Union Bank sometimes includes OTP warnings in genuine transaction SMS
    const lower = body.toLowerCase();
    if (lower.includes('do not share') && (lower.includes('debited') || lower.includes('credited'))) {
      return true;
    }
    return super.isTransactionMessage(body);
  }

  protected extractTransactionType(body: string): TransactionType | null {
    const lower = body.toLowerCase();
    // Union Bank uses "Dr" / "Cr" suffixes
    if (/\bDr\b/.test(body) || lower.includes('debit')) return 'EXPENSE';
    if (/\bCr\b/.test(body) || lower.includes('credit')) return 'INCOME';
    return super.extractTransactionType(body);
  }
}
