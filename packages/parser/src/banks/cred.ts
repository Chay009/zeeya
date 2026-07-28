// Exact 1:1 port of CredParser.kt from Cashiro parser-core
import { BankParser } from '../base-parser.js';
import type { TransactionType } from '../types.js';

export class CredParser extends BankParser {
  getBankName(): string {
    return 'CRED';
  }

  canHandle(sender: string): boolean {
    return sender.toUpperCase().includes('CRED');
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();
    return lower.includes('payment of') && lower.includes('credited towards your');
  }

  protected override extractTransactionType(_message: string): TransactionType | null {
    return 'TRANSFER';
  }

  protected override extractAmount(message: string): number | null {
    const match = /Rs\.?\s*([0-9,]+(?:\.\d{2})?)/.exec(message);
    if (match?.[1]) {
      const val = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }
    return null;
  }

  protected override extractMerchant(message: string, _sender: string): string | null {
    const match = /credited\s+towards\s+your\s+([^.]+)/i.exec(message);
    if (match?.[1]) {
      return match[1].trim();
    }
    return null;
  }

  protected override extractAccountLast4(_message: string): string | null {
    return null;
  }

  protected override extractReference(_message: string): string | null {
    return null;
  }
}
