import type { ParsedTransaction, SmsInput, TransactionType } from './types.js';
import { normalizeSms, parseAmount, cleanMerchant } from './normalize.js';
import { isTransactionMessage } from './filters.js';
import { P } from './patterns.js';

export abstract class BankParser {
  abstract getBankName(): string;
  abstract canHandle(sender: string): boolean;

  getCurrency(): string {
    return 'INR';
  }

  parse(input: SmsInput): ParsedTransaction | null {
    const body = normalizeSms(input.body);
    if (!this.isTransactionMessage(body)) return null;

    const amount = this.extractAmount(body);
    if (amount === null) return null;

    const type = this.extractTransactionType(body);
    if (type === null) return null;

    return {
      amount,
      currency: this.getCurrency(),
      type,
      merchant: this.extractMerchant(body, input.sender),
      accountLast4: this.extractAccountLast4(body),
      bankName: this.getBankName(),
      reference: this.extractReference(body),
      balance: this.extractBalance(body),
      isFromCard: this.detectIsCard(body),
      upiId: this.extractUpiId(body),
    };
  }

  protected isTransactionMessage(body: string): boolean {
    return isTransactionMessage(body);
  }

  protected extractAmount(body: string): number | null {
    for (const pattern of [P.Amount.RS_AMOUNT, P.Amount.INR_AMOUNT, P.Amount.AMOUNT_PREFIX, P.Amount.AMOUNT_SUFFIX]) {
      const m = body.match(pattern);
      if (m?.[1]) {
        const amount = parseAmount(m[1]);
        if (amount !== null) return amount;
      }
    }
    return null;
  }

  protected extractTransactionType(body: string): TransactionType | null {
    const lower = body.toLowerCase();

    if (lower.includes('mutual fund') || lower.includes(' sip ') || lower.includes('nfo ')) {
      return 'INVESTMENT';
    }

    if (
      (lower.includes('neft') || lower.includes('imps') || lower.includes('rtgs')) &&
      (lower.includes('to your') || lower.includes('to own') || lower.includes('to self'))
    ) {
      return 'TRANSFER';
    }

    const expenseKw = ['debited', 'withdrawn', 'spent', 'charged', 'deducted', 'purchase'];
    for (const kw of expenseKw) {
      if (lower.includes(kw)) return 'EXPENSE';
    }

    const incomeKw = ['credited', 'deposited', 'received', 'refund', 'cashback', 'reversal'];
    for (const kw of incomeKw) {
      if (lower.includes(kw)) return 'INCOME';
    }

    return null;
  }

  protected extractMerchant(body: string, _sender: string): string | null {
    for (const pattern of [P.Merchant.TO, P.Merchant.AT, P.Merchant.FOR, P.Merchant.FROM]) {
      const m = body.match(pattern);
      if (m?.[1]) {
        const cleaned = cleanMerchant(m[1]);
        if (cleaned.length >= 2 && !/^\d+$/.test(cleaned)) return cleaned;
      }
    }
    return null;
  }

  protected extractAccountLast4(body: string): string | null {
    for (const pattern of [P.Account.AC, P.Account.CARD, P.Account.ENDING, P.Account.MASKED]) {
      const m = body.match(pattern);
      if (m?.[1] && this.isValidAccountLast4(m[1])) return m[1];
    }
    return null;
  }

  protected isValidAccountLast4(value: string): boolean {
    const n = parseInt(value, 10);
    // exclude years and common date fragments
    if (n >= 2020 && n <= 2040) return false;
    return true;
  }

  protected extractBalance(body: string): number | null {
    for (const pattern of [P.Balance.AVL_BAL, P.Balance.UPDATED_BAL, P.Balance.BAL_IS, P.Balance.BAL_COLON]) {
      const m = body.match(pattern);
      if (m?.[1]) {
        const bal = parseAmount(m[1]);
        if (bal !== null) return bal;
      }
    }
    return null;
  }

  protected extractReference(body: string): string | null {
    for (const pattern of [P.Reference.REF, P.Reference.IMPS]) {
      const m = body.match(pattern);
      if (m?.[1]) return m[1];
    }
    return null;
  }

  protected detectIsCard(body: string): boolean {
    const lower = body.toLowerCase();
    return lower.includes('card') || lower.includes('avl limit') || lower.includes('avl lmt');
  }

  protected extractUpiId(body: string): string | null {
    return body.match(P.UPI.VPA)?.[1] ?? null;
  }
}
