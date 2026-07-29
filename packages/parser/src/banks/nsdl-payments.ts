// Exact 1:1 port of NSDLPaymentsBankParser.kt from Cashiro parser-core
import { BankParser } from '../base-parser.js';
import type { TransactionType } from '../types.js';

export class NSDLPaymentsBankParser extends BankParser {
  getBankName(): string {
    return 'NSDL Payments Bank';
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return u.includes('NSDLPB') || u.includes('NSDLPY') || u.includes('NSDL');
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();

    // Negative filters
    if (lower.includes('otp')) return false;
    if (lower.includes('password')) return false;

    // Positive: transaction keywords paired with NSDL or A/c context
    if (lower.includes('debited') && (lower.includes('nsdl') || lower.includes('a/c'))) return true;
    if (lower.includes('credited') && (lower.includes('nsdl') || lower.includes('a/c'))) return true;

    return super.isTransactionMessage(message);
  }

  protected override extractAmount(message: string): number | null {
    const patterns = [
      // "Rs.500.00 has been debited/credited"
      /Rs\.?\s*([\d,]+(?:\.\d{1,2})?)\s+(?:has\s+been\s+)?(?:debited|credited)/i,
      // "debited/credited by INR 250" or "debited by Rs.500"
      /(?:debited|credited)\s+by\s+(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/i,
      // "INR 250 debited/credited" (amount before verb)
      /INR\s+([\d,]+(?:\.\d{1,2})?)\s+(?:debited|credited)/i,
      // "INR 100.00 credited to A/c" — INR at start
      /^INR\s+([\d,]+(?:\.\d{1,2})?)/i,
      // "debited by INR 250 via"
      /(?:debited|credited)\s+by\s+INR\s+([\d,]+(?:\.\d{1,2})?)/i,
    ];
    for (const pattern of patterns) {
      const m = pattern.exec(message);
      if (m?.[1]) {
        const val = parseFloat((m[1] ?? '').replace(/,/g, ''));
        if (!isNaN(val) && val > 0) return val;
      }
    }

    // Fallback: first Rs. occurrence (likely the transaction amount in simpler messages)
    const rsMatch = /Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/i.exec(message);
    if (rsMatch?.[1]) {
      const val = parseFloat((rsMatch[1] ?? '').replace(/,/g, ''));
      if (!isNaN(val) && val > 0) return val;
    }

    return super.extractAmount(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();

    if (lower.includes('debited')) return 'EXPENSE';
    if (lower.includes('credited')) return 'INCOME';

    return super.extractTransactionType(message);
  }

  protected override extractAccountLast4(message: string): string | null {
    // Pattern: "A/c XX1234" or "a/c XXXX5678" — skip leading X's and grab digits
    const m = /[Aa]\/[Cc]\s+(?:X+)?(\d+)/i.exec(message);
    if (m?.[1]) {
      const digits = m[1];
      return digits.length >= 4 ? digits.slice(-4) : digits;
    }
    return super.extractAccountLast4(message);
  }

  protected override extractBalance(message: string): number | null {
    // Pattern: "Avl Bal: Rs.1500.00" or "Avl Bal Rs.1500.00"
    const avlBalMatch = /Avl\s+Bal[:\s]+(?:Rs\.?\s*)?([\d,]+(?:\.\d{1,2})?)/i.exec(message);
    if (avlBalMatch?.[1]) {
      const val = parseFloat((avlBalMatch[1] ?? '').replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    // Pattern: "Bal: Rs.3,000.00" or "Bal Rs.900.00" or "Bal:Rs.750.00"
    const balMatch = /\bBal[:\s]+(?:Rs\.?\s*)?([\d,]+(?:\.\d{1,2})?)/i.exec(message);
    if (balMatch?.[1]) {
      const val = parseFloat((balMatch[1] ?? '').replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    // Pattern: "Balance: Rs. ..."
    const balanceMatch = /Balance[:\s]+(?:Rs\.?\s*)?([\d,]+(?:\.\d{1,2})?)/i.exec(message);
    if (balanceMatch?.[1]) {
      const val = parseFloat((balanceMatch[1] ?? '').replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    return super.extractBalance(message);
  }

  protected override extractReference(message: string): string | null {
    // Pattern: "Txn Ref: 123456789012"
    const txnRefMatch = /Txn\s+Ref[:\s]+([A-Za-z0-9]+)/i.exec(message);
    if (txnRefMatch?.[1]) return txnRefMatch[1];

    // Pattern: "UPI Ref: 123456789"
    const upiRefMatch = /UPI\s+Ref[:\s]+([A-Za-z0-9]+)/i.exec(message);
    if (upiRefMatch?.[1]) return upiRefMatch[1];

    // Pattern: "Ref: 123456789"
    const refMatch = /\bRef[:\s]+([A-Za-z0-9]+)/i.exec(message);
    if (refMatch?.[1]) return refMatch[1];

    return super.extractReference(message);
  }
}
