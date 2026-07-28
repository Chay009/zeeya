// Exact 1:1 port of ICICIBankParser.kt from Cashiro parser-core
import { BankParser } from '../base-parser.js';
import type { ParsedTransaction, TransactionType } from '../types.js';

export class ICICIBankParser extends BankParser {
  getBankName(): string {
    return 'ICICI Bank';
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      u.includes('ICICI') ||
      u.includes('ICICIB') ||
      /^[A-Z]{2}-ICICIB-S$/.test(u) ||
      /^[A-Z]{2}-ICICI-S$/.test(u)
    );
  }

  override parse(smsBody: string, sender: string, timestamp: number): ParsedTransaction | null {
    if (!this.isTransactionMessage(smsBody)) return null;
    const amount = this.extractAmount(smsBody);
    if (amount === null) return null;
    const type = this.extractTransactionType(smsBody);
    if (type === null) return null;

    const currency = this.extractCurrencyFromMessage(smsBody) ?? 'INR';
    const availableLimit = type === 'CREDIT' ? this.extractAvailableLimit(smsBody) : null;

    return {
      amount,
      type,
      merchant: this.extractMerchant(smsBody, sender),
      reference: this.extractReference(smsBody),
      accountLast4: this.extractAccountLast4(smsBody),
      balance: this.extractBalance(smsBody),
      creditLimit: availableLimit,
      smsBody,
      sender,
      timestamp,
      bankName: this.getBankName(),
      transactionHash: null,
      isFromCard: this.detectIsCard(smsBody),
      currency,
      fromAccount: null,
      toAccount: null,
    };
  }

  private extractCurrencyFromMessage(message: string): string | null {
    const MONTH_ABBRS = new Set(['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']);
    const m = /([A-Z]{3})\s+[0-9,]+(?:\.\d{2})?\s+spent/i.exec(message);
    if (m) {
      const currency = (m[1] ?? '').toUpperCase();
      if (currency.length === 3 && !MONTH_ABBRS.has(currency)) return currency;
    }
    return null;
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    const salaryMatch = /INF[*\s]([^*\n]+?)\s+SAL/i.exec(message);
    if (salaryMatch?.[1]) return `Salary - ${salaryMatch[1].trim()}`;

    const cardMerchantMatch = /at\s+([^.\n]+?)\s+on\s+\d{2}-[A-Za-z]{3}-\d{4}/i.exec(message);
    if (cardMerchantMatch?.[1]) {
      const m = this.cleanMerchantName(cardMerchantMatch[1].trim());
      if (this.isValidMerchantName(m)) return m;
    }

    const achMatch = /(?:ACH|NACH)\s+(?:CR|DB)\s+([^.\n]+?)(?:\s+on|\s+Ref|$)/i.exec(message);
    if (achMatch?.[1]) {
      const m = this.cleanMerchantName(achMatch[1].trim());
      if (this.isValidMerchantName(m)) return m;
    }

    const towardsMatch = /towards\s+([^.\n]+?)(?:\s+Ref|\s+on|$)/i.exec(message);
    if (towardsMatch?.[1]) {
      const m = this.cleanMerchantName(towardsMatch[1].trim());
      if (this.isValidMerchantName(m)) return m;
    }

    const fromUpiMatch = /from\s+([^@\s]+)@/i.exec(message);
    if (fromUpiMatch?.[1]) {
      const m = this.cleanMerchantName(fromUpiMatch[1].trim());
      if (this.isValidMerchantName(m)) return m;
    }

    const creditedUpiMatch = /credited\.\s+UPI:[0-9]+\.\s+([^@\n]+?)(?:-[^@\n]+)?@/i.exec(message);
    if (creditedUpiMatch?.[1]) {
      const m = this.cleanMerchantName(creditedUpiMatch[1].trim());
      if (this.isValidMerchantName(m)) return m;
    }

    if (message.toLowerCase().includes('cash deposit')) return 'Cash Deposit';

    const autopayMatch = /(?:autopay|mandate)\s+(?:from|for)\s+([^.\n]+?)(?:\s+Ref|$)/i.exec(message);
    if (autopayMatch?.[1]) {
      const m = this.cleanMerchantName(autopayMatch[1].trim());
      if (this.isValidMerchantName(m)) return m;
    }

    return super.extractMerchant(message, sender);
  }

  protected override extractAccountLast4(message: string): string | null {
    const cardMatch = /ICICI\s+Bank\s+Card\s+(?:XX)?(\d{4})/i.exec(message);
    if (cardMatch?.[1]) return cardMatch[1];

    const accountMatch = /ICICI\s+Bank\s+(?:A\/c|Account)\s+(?:XX)?(\d+)/i.exec(message);
    if (accountMatch?.[1]) {
      const digits = accountMatch[1].replace(/\D/g, '');
      return digits.length >= 4 ? digits.slice(-4) : digits;
    }

    const acctMatch = /Acct\s+(?:XX)?(\d+)/i.exec(message);
    if (acctMatch?.[1]) {
      const digits = acctMatch[1].replace(/\D/g, '');
      return digits.length >= 4 ? digits.slice(-4) : digits;
    }

    return super.extractAccountLast4(message);
  }

  protected override extractReference(message: string): string | null {
    const rrnMatch = /RRN[:\s]+([0-9]+)/i.exec(message);
    if (rrnMatch?.[1]) return rrnMatch[1];

    const upiColonMatch = /UPI:\s*([0-9]+)/i.exec(message);
    if (upiColonMatch?.[1]) return upiColonMatch[1];

    const txnRefMatch = /transaction\s+reference\s+no\.?\s*([A-Z0-9]+)/i.exec(message);
    if (txnRefMatch?.[1]) return txnRefMatch[1];

    return super.extractReference(message);
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();
    if (lower.includes('is due') || lower.includes('minimum amount due')) return false;
    if (lower.includes('your icici bank credit card') && lower.includes('statement')) return false;
    return super.isTransactionMessage(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();
    if (lower.includes('debited') || lower.includes('debit')) return 'EXPENSE';
    if (lower.includes('spent')) return 'EXPENSE';
    if (lower.includes('credited') || lower.includes('credit')) return 'INCOME';
    if (lower.includes('deposited')) return 'INCOME';
    return super.extractTransactionType(message);
  }
}
