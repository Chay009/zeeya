import { BankParser } from '../base-parser.js';
import type { TransactionType } from '../types.js';
import { parseAmount, cleanMerchant } from '../normalize.js';

const SENDERS = new Set(['IDFCFB', 'IDFCBK', 'IDFCB', 'IDFCFIRST', 'IDFCBKTS']);
const DLT = /^[A-Z]{2}-IDFC/;

export class IDFCFirstBankParser extends BankParser {
  getBankName() { return 'IDFC First Bank'; }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return SENDERS.has(u) || DLT.test(u);
  }

  protected extractAmount(body: string): number | null {
    const patterns = [
      // Foreign currency: "USD 11.80 spent"
      /[A-Z]{3}\s*([\d,]+(?:\.\d{1,2})?)\s*(?:spent|debited)/i,
      /(?:Rs\.?|₹|INR)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:debited|credited|spent)/i,
      /(?:Rs\.?|₹|INR)\s*([\d,]+(?:\.\d{1,2})?)/i,
    ];
    for (const p of patterns) {
      const m = body.match(p);
      if (m?.[1]) {
        const amount = parseAmount(m[1]);
        if (amount !== null) return amount;
      }
    }
    return super.extractAmount(body);
  }

  protected extractTransactionType(body: string): TransactionType | null {
    const lower = body.toLowerCase();

    if (lower.includes('interest') && lower.includes('credited')) return 'INCOME';
    if (lower.includes('avl credit limit') || lower.includes('available credit limit')) {
      return lower.includes('debited') || lower.includes('spent') ? 'EXPENSE' : null;
    }

    return super.extractTransactionType(body);
  }

  protected extractMerchant(body: string, sender: string): string | null {
    // "spent at MERCHANT"
    const spentM = body.match(/[Ss]pent\s+at\s+([A-Za-z0-9][^.\n]{2,40}?)(?:\s+on|\s+Ref|\.|$)/);
    if (spentM?.[1]) return cleanMerchant(spentM[1]);

    if (/\bATM\b/.test(body)) return 'ATM Withdrawal';

    return super.extractMerchant(body, sender);
  }
}
