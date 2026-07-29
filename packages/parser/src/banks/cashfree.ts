// Exact 1:1 port of CashfreeParser.kt from Cashiro parser-core
import { BankParser } from '../base-parser.js';
import type { TransactionType } from '../types.js';

export class CashfreeParser extends BankParser {
  getBankName(): string {
    return 'Cashfree';
  }

  override getCurrency(): string {
    return 'INR';
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      u.includes('CASHFR') ||
      u.includes('CFPAY') ||
      u.includes('CASFRP') ||
      u.includes('CASHFREE')
    );
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();

    // Negative filter: OTP messages
    if (lower.includes('otp')) return false;

    // Positive keywords specific to Cashfree
    if (lower.includes('cashfree')) return true;
    if (lower.includes('payout')) return true;
    if (lower.includes('settlement')) return true;
    if (lower.includes('credited via cashfree')) return true;

    return super.isTransactionMessage(message);
  }

  protected override extractTransactionType(_message: string): TransactionType | null {
    // Cashfree always sends money TO users — always INCOME
    return 'INCOME';
  }

  protected override extractAmount(message: string): number | null {
    // Pattern 1: "Rs.500.00" or "Rs. 500.00" (with optional space after Rs.)
    const rsDotMatch = /Rs\.?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i.exec(message);
    if (rsDotMatch?.[1]) {
      const val = parseFloat(rsDotMatch[1].replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    // Pattern 2: "INR 250.00" or "INR250.00"
    const inrMatch = /INR\s*([0-9,]+(?:\.[0-9]{1,2})?)/i.exec(message);
    if (inrMatch?.[1]) {
      const val = parseFloat(inrMatch[1].replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    return super.extractAmount(message);
  }

  protected override extractReference(message: string): string | null {
    // Pattern 1: "UPI Ref: 123456789012"
    const upiRefMatch = /UPI\s+Ref[:\s]+([A-Za-z0-9]+)/i.exec(message);
    if (upiRefMatch?.[1]) return upiRefMatch[1];

    // Pattern 2: "Txn ID: CF987654321" or "Txn Id: ..."
    const txnIdMatch = /Txn\s+ID[:\s]+([A-Za-z0-9]+)/i.exec(message);
    if (txnIdMatch?.[1]) return txnIdMatch[1];

    // Pattern 3: "Ref: CF123456789"
    const refMatch = /\bRef[:\s]+([A-Za-z0-9]+)/i.exec(message);
    if (refMatch?.[1]) return refMatch[1];

    // Pattern 4: "Reference: 123456789"
    const referenceMatch = /Reference[:\s]+([A-Za-z0-9]+)/i.exec(message);
    if (referenceMatch?.[1]) return referenceMatch[1];

    return super.extractReference(message);
  }

  protected override extractAccountLast4(message: string): string | null {
    // Pattern: "Account: XXXX1234"
    const accountMatch = /Account[:\s]+[Xx*]+([0-9]{4})/i.exec(message);
    if (accountMatch?.[1]) return accountMatch[1];

    return super.extractAccountLast4(message);
  }

  protected override extractMerchant(_message: string, _sender: string): string | null {
    return 'Cashfree';
  }
}
