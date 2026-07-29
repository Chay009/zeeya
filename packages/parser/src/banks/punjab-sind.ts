// Exact 1:1 port of PunjabSindBankParser from Cashiro parser-core
import { BankParser } from '../base-parser.js';
import type { TransactionType } from '../types.js';

export class PunjabSindBankParser extends BankParser {
  getBankName(): string {
    return 'Punjab & Sind Bank';
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      u.includes('PSBBNK') ||
      u.includes('PSBANK') ||
      u.includes('PUNSIN') ||
      u.includes('PUNJABSIND')
    );
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();

    // Negative filters
    if (lower.includes('otp')) return false;
    if (lower.includes('password')) return false;

    // Positive: debit/credit keywords with account context
    const hasDebitCredit =
      lower.includes('debited') ||
      lower.includes('credited') ||
      lower.includes('debit') ||
      lower.includes('credit');

    const hasAccountContext =
      lower.includes('a/c') ||
      lower.includes('acct') ||
      lower.includes('account');

    if (hasDebitCredit && hasAccountContext) return true;

    return super.isTransactionMessage(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();
    // Debited / Debit → EXPENSE
    if (lower.includes('debited') || lower.includes('debit')) return 'EXPENSE';
    // Credited / Credit → INCOME
    if (lower.includes('credited') || lower.includes('credit')) return 'INCOME';
    return super.extractTransactionType(message);
  }

  protected override extractAmount(message: string): number | null {
    // Pattern 1: "Rs.500.00 Debited" / "Rs 250.00"
    // Pattern 2: "INR 100"
    // Pattern 3: "Debited by Rs.500.00" / "Credit Rs 250"
    const patterns = [
      /(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{1,2})?)/i,
    ];

    for (const pattern of patterns) {
      const m = pattern.exec(message);
      if (m?.[1]) {
        const val = parseFloat((m[1] ?? '').replace(/,/g, ''));
        if (!isNaN(val) && val > 0) return val;
      }
    }

    return super.extractAmount(message);
  }

  protected override extractAccountLast4(message: string): string | null {
    // Pattern 1: "A/c XXXX1234" or "A/c No XXXXXXXX1234"
    const acMatch = /A\/c\s*(?:No\.?\s+)?([X*\d]{4,20})/i.exec(message);
    if (acMatch?.[1]) {
      return (acMatch[1] ?? '').replace(/[Xx*]/g, '').slice(-4) || null;
    }

    // Pattern 2: "Acct No XXXXXXXX1234" or "Acct XXXX1234"
    const acctMatch = /Acct\s*(?:No\.?\s+)?([X*\d]{4,20})/i.exec(message);
    if (acctMatch?.[1]) {
      return (acctMatch[1] ?? '').replace(/[Xx*]/g, '').slice(-4) || null;
    }

    return super.extractAccountLast4(message);
  }

  protected override extractBalance(message: string): number | null {
    // Pattern 1: "Avl Bal Rs 750" / "Avl Bal Rs.750.00"
    const avlBalMatch = /Avl\s+Bal\s+(?:Rs\.?\s*)?([0-9,]+(?:\.\d{1,2})?)/i.exec(message);
    if (avlBalMatch?.[1]) {
      const val = parseFloat((avlBalMatch[1] ?? '').replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    // Pattern 2: "Balance: Rs.5,000.00" / "Balance Rs 5000"
    const balanceMatch = /Balance:?\s+(?:Rs\.?\s*)?([0-9,]+(?:\.\d{1,2})?)/i.exec(message);
    if (balanceMatch?.[1]) {
      const val = parseFloat((balanceMatch[1] ?? '').replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    // Pattern 3: "Bal Rs.1500.00" / "Bal Rs 900"
    const balMatch = /Bal\s+(?:Rs\.?\s*)?([0-9,]+(?:\.\d{1,2})?)/i.exec(message);
    if (balMatch?.[1]) {
      const val = parseFloat((balMatch[1] ?? '').replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    return super.extractBalance(message);
  }

  protected override extractReference(message: string): string | null {
    // Pattern 1: "UPI Ref 123456789012"
    const upiRefMatch = /UPI\s+Ref\s+([0-9A-Za-z]+)/i.exec(message);
    if (upiRefMatch?.[1]) return upiRefMatch[1] ?? null;

    // Pattern 2: "Ref No 123456789012"
    const refNoMatch = /Ref\s+No\.?\s+([0-9A-Za-z]+)/i.exec(message);
    if (refNoMatch?.[1]) return refNoMatch[1] ?? null;

    return super.extractReference(message);
  }
}
