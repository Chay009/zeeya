// Exact 1:1 port of UtkarshBankParser.kt from Cashiro parser-core
import { BankParser } from '../base-parser.js';
import { CompiledPatterns } from '../patterns.js';
import type { TransactionType } from '../types.js';

/**
 * Parser for Utkarsh Small Finance Bank (SFBL) SuperCard credit card transactions.
 * Handles messages from UTKSPR and similar senders.
 */
export class UtkarshBankParser extends BankParser {
  getBankName(): string {
    return 'Utkarsh Bank';
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      u.includes('UTKSPR') ||
      u.includes('UTKARSH') ||
      u.includes('UTKSFB')
    );
  }

  protected override extractAmount(message: string): number | null {
    // Utkarsh SuperCard messages start with "INR XXX.XX" but also contain
    // "Avl Limit: Rs.XXXX.XX" at the end.  The base parser tries RS_PATTERN
    // first and incorrectly picks up the available-limit figure.  Prioritise
    // INR, then fall back to the base implementation (which uses Rs. first
    // and works correctly when the transaction amount itself starts with Rs.).
    const inrMatch = CompiledPatterns.Amount.INR_PATTERN.exec(message);
    if (inrMatch?.[1]) {
      const val = parseFloat(inrMatch[1].replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }
    return super.extractAmount(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    const lowerMessage = message.toLowerCase();

    // Pattern 1: "for UPI - merchant/reference"
    const upiGroup = /for\s+UPI\s*[-–]\s*([^\s.]+)/i.exec(message)?.[1];
    if (upiGroup !== undefined) {
      const merchant = upiGroup.trim();
      // Check if it's just a reference number (all digits or with x's)
      if (!/^[x0-9]+$/.test(merchant)) {
        return this.cleanMerchantName(merchant);
      }
    }

    // Pattern 2: "for merchant on date"
    const forGroup = /for\s+([^0-9][^\s]+?)(?:\s+on\s+|\s+at\s+|$)/i.exec(message)?.[1];
    if (forGroup !== undefined) {
      const merchant = forGroup.trim();
      if (
        merchant.toLowerCase() !== 'upi' &&
        merchant.toLowerCase() !== 'inr'
      ) {
        return this.cleanMerchantName(merchant);
      }
    }

    // Check for specific patterns
    if (lowerMessage.includes('supercard') && lowerMessage.includes('upi')) {
      return 'UPI Payment';
    }

    // Do not delegate to super.extractMerchant — base FROM/AT patterns would
    // spuriously match "from Utkarsh Bank SuperCard xxNNNN on …" and return
    // the card description as a merchant name.
    return 'Utkarsh SuperCard';
  }

  protected override extractTransactionType(_message: string): TransactionType | null {
    // Utkarsh SuperCard is a credit card product, all transactions are credit
    return 'CREDIT';
  }

  protected override extractAccountLast4(message: string): string | null {
    // Pattern for SuperCard xxxx
    const cardGroup = /SuperCard\s+[xX*]*(\d{4})/i.exec(message)?.[1];
    if (cardGroup !== undefined) {
      return cardGroup;
    }

    // Pattern for account XXXX
    const accountGroup = /(?:account|a\/c)\s+[xX*]*(\d{4})/i.exec(message)?.[1];
    if (accountGroup !== undefined) {
      return accountGroup;
    }

    return super.extractAccountLast4(message);
  }
}
