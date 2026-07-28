import { BankParser } from '../base-parser.js';
import type { TransactionType } from '../types.js';

export class HDFCMutualFundParser extends BankParser {
  getBankName(): string {
    return 'HDFC Mutual Fund';
  }

  canHandle(sender: string): boolean {
    return sender.toUpperCase().includes('HDFCMF');
  }

  protected isTransactionMessage(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    const keywords = ['sip purchase', 'has been processed', 'folio', 'nav', 'redemption'];
    if (keywords.some(k => lowerMessage.includes(k))) return true;
    return super.isTransactionMessage(message);
  }

  protected extractAmount(message: string): number | null {
    const pattern = /Rs\.?\s*([\d,]+\.?\d*)/;
    const match = pattern.exec(message);
    if (match) {
      const amountStr = (match[1] ?? '').replace(/,/g, '');
      const val = parseFloat(amountStr);
      return isNaN(val) ? null : val;
    }
    return null;
  }

  protected extractMerchant(message: string, _sender: string): string | null {
    const pattern = /under\s+(.+?)\s+for/i;
    const match = pattern.exec(message);
    if (match) {
      return match[1]?.trim() ?? null;
    }
    return null;
  }

  protected extractTransactionType(message: string): TransactionType | null {
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('sip purchase') || lowerMessage.includes('purchase')) return 'INVESTMENT';
    if (lowerMessage.includes('redemption')) return 'INCOME';
    return null;
  }

  protected extractBalance(_message: string): number | null {
    return null;
  }

  protected extractAccountLast4(_message: string): string | null {
    return null;
  }
}
