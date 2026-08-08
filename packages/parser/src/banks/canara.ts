// Exact 1:1 port of CanaraBankParser.kt from Cashiro parser-core
import { BankParser } from '../base-parser.js';

export class CanaraBankParser extends BankParser {
  getBankName(): string {
    return 'Canara Bank';
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return u.includes('CANBNK') || u.includes('CANARA');
  }

  protected override extractAmount(message: string): number | null {
    const m1 = /Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+paid/i.exec(message);
    if (m1?.[1]) {
      const val = parseFloat(m1[1].replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    const m2 = /INR\s+([\d,]+(?:\.\d{2})?)\s+has\s+been\s+DEBITED/i.exec(message);
    if (m2?.[1]) {
      const val = parseFloat(m2[1].replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    return super.extractAmount(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    const m = /\sto\s+([^,]+?)(?:,\s*UPI|\.|-Canara)/i.exec(message);
    if (m?.[1]) {
      const merchant = this.cleanMerchantName(m[1].trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    if (/DEBITED/i.test(message)) return 'Canara Bank Debit';

    return super.extractMerchant(message, sender);
  }

  protected override extractAccountLast4(message: string): string | null {
    const m = /(?:account|A\/C)\s+(?:XX|X\*+)?(\d{3,4})/i.exec(message);
    if (m?.[1]) return m[1];
    return super.extractAccountLast4(message);
  }

  protected override extractBalance(message: string): number | null {
    const m = /(?:Total\s+)?Avail\.?bal\s+INR\s+([\d,]+(?:\.\d{2})?)/i.exec(message);
    if (m?.[1]) {
      const val = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }
    return super.extractBalance(message);
  }

  protected override extractReference(message: string): string | null {
    const m = /UPI\s+Ref\s+(\d+)/i.exec(message);
    if (m?.[1]) return m[1];
    return super.extractReference(message);
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();
    if (lower.includes('failed due to')) return false;
    if (
      lower.includes('paid thru') ||
      lower.includes('has been debited') ||
      lower.includes('has been credited')
    ) return true;
    return super.isTransactionMessage(message);
  }
}
