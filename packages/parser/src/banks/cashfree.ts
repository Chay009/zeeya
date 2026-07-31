// Exact 1:1 port of CashfreeParser.kt from Cashiro parser-core
import { BankParser } from '../base-parser.js';
import type { TransactionType } from '../types.js';

export class CashfreeParser extends BankParser {
  getBankName(): string {
    return 'Cashfree';
  }

  getCurrency(): string {
    return 'INR';
  }

  canHandle(sender: string): boolean {
    return sender.toUpperCase().includes('CASHFREE');
  }

  protected override extractAmount(message: string): number | null {
    const inrPattern = /INR\s+(\d+(?:,\d{3})*(?:\.\d{2})?)/i;
    const match = inrPattern.exec(message);
    if (match?.[1]) {
      const amountStr = (match[1] ?? '').replace(/,/g, '');
      const val = parseFloat(amountStr);
      if (!isNaN(val)) return val;
    }
    return super.extractAmount(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('credited')) return 'INCOME';
    if (lowerMessage.includes('debited') || lowerMessage.includes('spent') || lowerMessage.includes('paid')) return 'EXPENSE';
    return super.extractTransactionType(message);
  }
}
