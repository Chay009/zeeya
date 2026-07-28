// Exact 1:1 port of PNBBankParser.kt from Cashiro parser-core
import { BankParser } from '../base-parser.js';
import type { ParsedTransaction, TransactionType } from '../types.js';

export class PNBBankParser extends BankParser {
  getBankName(): string {
    return 'Punjab National Bank';
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      u.includes('PUNJAB NATIONAL BANK') ||
      u.includes('PNBBNK') ||
      u.includes('PUNBN') ||
      u.includes('PNBSMS') ||
      /^[A-Z]{2}-PNBBNK-S$/.test(u) ||
      /^[A-Z]{2}-PNB-S$/.test(u) ||
      /^[A-Z]{2}-PNBBNK$/.test(u) ||
      /^[A-Z]{2}-PNB$/.test(u) ||
      u === 'PNBBNK' ||
      u === 'PNB'
    );
  }

  private normalizeUnicodeText(text: string): string {
    return text
      .normalize('NFKD')
      .replace(/[^\x00-\x7F₹$€£¥]/g, '');
  }

  override parse(smsBody: string, sender: string, timestamp: number): ParsedTransaction | null {
    const normalizedBody = this.normalizeUnicodeText(smsBody);
    return super.parse(normalizedBody, sender, timestamp);
  }

  protected override extractAmount(message: string): number | null {
    const patterns = [
      /initial\s+amount\s+of\s+(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)\s+has\s+been\s+debited/i,
      /UPI-Mandate\s+is\s+successfully\s+created.*?for\s+(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i,
      /debited\s+with\s+(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i,
    ];
    for (const pattern of patterns) {
      const m = pattern.exec(message);
      if (m?.[1]) {
        const val = parseFloat(m[1].replace(/,/g, ''));
        if (!isNaN(val)) return val;
      }
    }

    const creditMatch = /(?:(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)\s+(?:has\s+been\s+)?credited|credited\s+(?:with\s+)?(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?))/i.exec(message);
    if (creditMatch) {
      const str = creditMatch[1] || creditMatch[2];
      if (str) {
        const val = parseFloat(str.replace(/,/g, ''));
        if (!isNaN(val)) return val;
      }
    }

    return super.extractAmount(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();
    if (lower.includes('auto pay facility') || lower.includes('upi-mandate')) return 'EXPENSE';
    return super.extractTransactionType(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    const fromAutoPayMatch = /auto\s+pay.*?activated.*?from\s+([^.]+?)(?:\s+An\s+initial|\.|$)/i.exec(message);
    if (fromAutoPayMatch?.[1]) return fromAutoPayMatch[1].trim();

    const towardsMatch = /UPI-Mandate.*towards\s+([^\s]+)\s+for/i.exec(message);
    if (towardsMatch?.[1]) return towardsMatch[1].trim();

    const cardMatch = /thru\s+card\s+([X\*]+\d{4})/i.exec(message);
    if (cardMatch?.[1]) return `Card ${cardMatch[1]}`;

    const fromSlashMatch = /From\s+([^/]+)\//i.exec(message);
    if (fromSlashMatch?.[1]) {
      const m = this.cleanMerchantName(fromSlashMatch[1].trim());
      if (this.isValidMerchantName(m)) return m;
    }

    if (message.includes('PNB ATM')) return 'PNB ATM Withdrawal';
    if (message.includes('NEFT')) return 'NEFT Transfer';
    if (message.includes('UPI')) return 'UPI Transaction';

    return super.extractMerchant(message, sender);
  }

  protected override extractAccountLast4(message: string): string | null {
    const m = /(?:A\/c(?:\s*No\.)?|Ac|Card)\s*(?:[X\*]+)?(\d{4,16})/i.exec(message);
    if (m?.[1]) return m[1].slice(-4);
    return super.extractAccountLast4(message);
  }

  protected override extractReference(message: string): string | null {
    const m1 = /ref\s+no\.\s+([A-Z0-9]+)/i.exec(message);
    if (m1?.[1]) return m1[1];

    const m2 = /UPI:\s*([0-9]+)/i.exec(message);
    if (m2?.[1]) return m2[1];

    return super.extractReference(message);
  }

  protected override extractBalance(message: string): number | null {
    const m1 = /(?:Aval\s+Bal|Avl\s+Bal|Bal)\s*(?:INR\s*|Rs\.?\s*)?([0-9,]+(?:\.\d{2})?)(?:\s+(?:CR|DR))?/i.exec(message);
    if (m1?.[1]) {
      const val = parseFloat(m1[1].replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    const m2 = /Bal\s*([0-9,]+(?:\.\d{2})?)\s+(?:CR|DR)/i.exec(message);
    if (m2?.[1]) {
      const val = parseFloat(m2[1].replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    return super.extractBalance(message);
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();
    if (lower.includes('auto pay facility') && lower.includes('debited')) return true;
    if (lower.includes('upi-mandate') && lower.includes('successfully created')) return true;
    if (lower.includes('register for e-statement')) return true;
    return super.isTransactionMessage(message);
  }
}
