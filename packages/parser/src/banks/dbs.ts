// Exact 1:1 port of DBSBankParser.kt from Cashiro parser-core
import { BankParser } from '../base-parser.js';
import type { TransactionType } from '../types.js';

function parseNum(str: string): number | null {
  const n = parseFloat(str.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export class DBSBankParser extends BankParser {
  getBankName(): string {
    return 'DBS Bank';
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      u.includes('DBSBNK') ||
      u.includes('DBS') ||
      u === 'DBSBANK' ||
      // DLT patterns
      /^[A-Z]{2}-DBSBNK-[ST]$/.test(u) ||
      /^[A-Z]{2}-DBS-[ST]$/.test(u) ||
      /^[A-Z]{2}-DBSBANK-[ST]$/.test(u)
    );
  }

  protected override extractAmount(message: string): number | null {
    // Pattern: "debited with INR 11" or "credited with INR 100"
    const patterns = [
      /(?:debited|credited)\s+with\s+INR\s*([0-9,]+(?:\.\d{2})?)/i,
      /INR\s*([0-9,]+(?:\.\d{2})?)\s+(?:debited|credited)/i,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(message);
      if (match?.[1]) {
        const val = parseNum(match[1]);
        if (val !== null) return val;
      }
    }

    return super.extractAmount(message);
  }

  protected override extractAccountLast4(message: string): string | null {
    // Pattern: "account no ********1234" or "a/c ****1234" or "account ****1234"
    const patterns = [
      /account\s+no\s+\*+(\d{4})/i,
      /a\/c\s+\*+(\d{4})/i,
      /account\s+\*+(\d{4})/i,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(message);
      if (match?.[1]) return match[1];
    }

    return super.extractAccountLast4(message);
  }

  protected override extractBalance(message: string): number | null {
    // Pattern: "Current Balance is INR37888.45" or "Balance: INR 1000" or "Avl Bal: INR 1000"
    const patterns = [
      /Current\s+Balance\s+is\s+INR\s*([0-9,]+(?:\.\d{2})?)/i,
      /Balance[:\s]+INR\s*([0-9,]+(?:\.\d{2})?)/i,
      /Avl\s+Bal[:\s]+INR\s*([0-9,]+(?:\.\d{2})?)/i,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(message);
      if (match?.[1]) {
        const val = parseNum(match[1]);
        if (val !== null) return val;
      }
    }

    return super.extractBalance(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();

    if (lower.includes('debited')) return 'EXPENSE';
    if (lower.includes('credited')) return 'INCOME';
    if (lower.includes('withdrawn')) return 'EXPENSE';
    if (lower.includes('deposited')) return 'INCOME';

    return super.extractTransactionType(message);
  }
}
