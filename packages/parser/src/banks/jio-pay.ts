// Exact 1:1 port of JioPayParser.kt from Cashiro parser-core
import { BankParser } from '../base-parser.js';
import type { TransactionType } from '../types.js';

function parseNum(str: string): number | null {
  const n = parseFloat(str.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export class JioPayParser extends BankParser {
  getBankName(): string {
    return 'JioPay';
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      u.includes('JIOPAY') ||
      u === 'JA-JIOPAY-S' ||
      u === 'JM-JIOPAY'
    );
  }

  protected override extractAmount(message: string): number | null {
    const planMatch = /Plan\s+Name\s*:\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (planMatch?.[1]) {
      const val = parseNum(planMatch[1]);
      if (val !== null) return val;
    }

    const rsMatch = /Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (rsMatch?.[1]) {
      const val = parseNum(rsMatch[1]);
      if (val !== null) return val;
    }

    return super.extractAmount(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    const lower = message.toLowerCase();

    if (lower.includes('recharge successful') && lower.includes('jio number')) {
      const numberMatch = /Jio\s+Number\s*:\s*(\d{10})/i.exec(message);
      const number = numberMatch?.[1] ?? '';
      if (number.length > 0) {
        return `Jio Recharge - ${number.slice(0, 4)}****`;
      }
      return 'Jio Recharge';
    }

    if (lower.includes('bill payment')) {
      if (lower.includes('electricity')) return 'Electricity Bill';
      if (lower.includes('water')) return 'Water Bill';
      if (lower.includes('gas')) return 'Gas Bill';
      if (lower.includes('broadband')) return 'Broadband Bill';
      if (lower.includes('dth')) return 'DTH Recharge';
      return 'Bill Payment';
    }

    if (lower.includes('recharge')) {
      if (lower.includes('mobile')) return 'Mobile Recharge';
      if (lower.includes('dth')) return 'DTH Recharge';
      if (lower.includes('data')) return 'Data Recharge';
      return 'Recharge';
    }

    if (lower.includes('payment successful to')) {
      const toMatch = /payment\s+successful\s+to\s+([^.\n]+?)(?:\s+for\s+(?:Rs\.?|INR)|\s+(?:Rs\.?|INR)|[.\n]|$)/i.exec(message);
      if (toMatch?.[1]) {
        return this.cleanMerchantName(toMatch[1].trim());
      }
      return 'JioPay Payment';
    }

    return super.extractMerchant(message, sender) ?? 'JioPay Transaction';
  }

  protected override extractReference(message: string): string | null {
    const txnMatch = /Transaction\s+ID\s*:\s*([A-Z0-9]+)/i.exec(message);
    if (txnMatch?.[1]) return txnMatch[1];

    return super.extractReference(message);
  }

  protected override extractTransactionType(_message: string): TransactionType {
    return 'CREDIT';
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();
    if (lower.includes('recharge successful')) return true;
    if (lower.includes('payment successful')) return true;
    if (lower.includes('bill payment successful')) return true;
    return super.isTransactionMessage(message);
  }
}
