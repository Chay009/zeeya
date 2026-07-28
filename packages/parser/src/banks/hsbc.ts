// Exact 1:1 port of HSBCBankParser.kt from Cashiro parser-core
import { BankParser } from '../base-parser.js';
import type { TransactionType } from '../types.js';

export class HSBCBankParser extends BankParser {
  getBankName(): string {
    return 'HSBC Bank';
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      u.includes('HSBC') ||
      u.includes('HSBCIN') ||
      /^[A-Z]{2}-HSBCIN-[A-Z]$/.test(u) ||
      /^[A-Z]{2}-HSBC-[A-Z]$/.test(u)
    );
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();

    // Skip OTP messages
    if (lower.includes('otp is') || lower.includes('otp valid for')) return false;

    // HSBC-specific transaction keywords
    if (
      lower.includes('is paid from') ||
      lower.includes('is credited to') ||
      lower.includes('is debited') ||
      (lower.includes('creditcard') && lower.includes('used at')) ||
      (lower.includes('credit card') && lower.includes('used at')) ||
      (lower.includes('thank you for using') && lower.includes('card')) ||
      (lower.includes('debit card') && lower.includes('for inr')) ||
      (lower.includes('inr') && lower.includes('account'))
    ) {
      return true;
    }

    return super.isTransactionMessage(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();

    // Debit card transactions
    if (lower.includes('debit card') && lower.includes('thank you for using')) return 'EXPENSE';
    if (lower.includes('debit card') && lower.includes('for inr')) return 'EXPENSE';

    // Credit card transactions
    if (lower.includes('creditcard') || lower.includes('credit card')) return 'CREDIT';

    // Standard transaction patterns
    if (lower.includes('is paid from')) return 'EXPENSE';
    if (lower.includes('is debited')) return 'EXPENSE';
    if (lower.includes('is credited to')) return 'INCOME';
    if (lower.includes('is credited with')) return 'INCOME';
    if (lower.includes('deposited')) return 'INCOME';

    return super.extractTransactionType(message);
  }

  protected override extractAmount(message: string): number | null {
    // Pattern 1: "INR 1000.50 is paid from" / "INR 5000.00 is credited" / "INR xxx is debited"
    const pattern1Match = /INR\s+([\d,]+(?:\.\d{2})?)\s+is\s+(?:paid|credited|debited)/i.exec(message);
    if (pattern1Match?.[1]) {
      const val = parseFloat(pattern1Match[1].replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    // Pattern 2: "for INR 49.00 on" (debit card format)
    const debitCardMatch = /for\s+INR\s+([\d,]+(?:\.\d{2})?)\s+on/i.exec(message);
    if (debitCardMatch?.[1]) {
      const val = parseFloat(debitCardMatch[1].replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    // Pattern 3: "for INR 305.00" (credit card — trailing space, end, or period)
    const creditCardMatch = /for\s+INR\s+([\d,]+(?:\.\d{2})?)(?:\s|$|\.)/i.exec(message);
    if (creditCardMatch?.[1]) {
      const val = parseFloat(creditCardMatch[1].replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    return super.extractAmount(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    // Pattern 1: "as NEFT/RTGS/IMPS from ... ." (NEFT/credit transactions)
    const neftCreditMatch = /as\s+(?:NEFT|RTGS|IMPS)\s+from\s+(.+?)\s+\./i.exec(message);
    if (neftCreditMatch?.[1]) {
      const merchant = this.cleanMerchantName(neftCreditMatch[1].trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    // Pattern 2: "at MERCHANT ." (debit card format with space before period)
    const atMerchantMatch = /at\s+([^.]+?)\s*\./i.exec(message);
    if (atMerchantMatch?.[1]) {
      const merchant = this.cleanMerchantName(atMerchantMatch[1].trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    // Pattern 3: "used at MERCHANT for INR" (credit card)
    const creditCardMatch = /used\s+at\s+([^\s]+)\s+for\s+INR/i.exec(message);
    if (creditCardMatch?.[1]) {
      const merchant = this.cleanMerchantName(creditCardMatch[1].trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    // Pattern 4: "to MERCHANT on [digit]" (payment transactions)
    const paymentMatch = /to\s+([^.]+?)\s+on\s+\d/i.exec(message);
    if (paymentMatch?.[1]) {
      const merchant = this.cleanMerchantName(paymentMatch[1].trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    // Pattern 5: "from MERCHANT" (generic credits)
    const creditMatch = /from\s+([^.]+?)(?:\s+on\s+|\s+with\s+|$)/i.exec(message);
    if (creditMatch?.[1]) {
      const merchant = this.cleanMerchantName(creditMatch[1].trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    return super.extractMerchant(message, sender);
  }

  protected override cleanMerchantName(merchant: string): string {
    let cleaned = super.cleanMerchantName(merchant);
    // Remove "for INR xxx" suffix that may appear in credit card transactions
    cleaned = cleaned.replace(/\s+for\s+INR\s+[\d,]+(?:\.\d{2})?$/i, '');
    return cleaned.trim();
  }

  protected override extractAccountLast4(message: string): string | null {
    // Pattern 1: "A/c 074-260***-006" format
    const acNoMatch = /A\/c\s+\d+-\d+\*+-(\d+)/i.exec(message);
    if (acNoMatch?.[1]) {
      return acNoMatch[1].padStart(4, '0');
    }

    // Pattern 2: "Debit Card XXXXX71xx" format (may include trailing x chars)
    const debitCardMatch = /Debit\s+Card\s+[X*]+(\d+[xX]*)/i.exec(message);
    if (debitCardMatch?.[1]) {
      const cardNum = debitCardMatch[1];
      return cardNum.length >= 4 ? cardNum.slice(-4).toLowerCase() : cardNum.toLowerCase();
    }

    // Pattern 3: "creditcard xxxxx1234" or "credit card xxxxx1234"
    const creditCardMatch = /credit\s*card\s+[xX*]+(\d{4})/i.exec(message);
    if (creditCardMatch?.[1]) {
      return creditCardMatch[1];
    }

    // Pattern 4: "account XXXXXX1234"
    const accountMatch = /account\s+[X*]+(\d{4})/i.exec(message);
    if (accountMatch?.[1]) {
      return accountMatch[1];
    }

    return super.extractAccountLast4(message);
  }

  protected override extractReference(message: string): string | null {
    // Pattern 1: "with UTR CHASH00007392391" (NEFT/RTGS/IMPS transactions)
    const utrMatch = /with\s+UTR\s+(\w+)/i.exec(message);
    if (utrMatch?.[1]) return utrMatch[1];

    // Pattern 2: "with ref 222222222222"
    const refMatch = /with\s+ref\s+(\w+)/i.exec(message);
    if (refMatch?.[1]) return refMatch[1];

    return super.extractReference(message);
  }

  protected override extractBalance(message: string): number | null {
    // Pattern 1: "Your Avl Bal is INR xyz" (abbreviated form)
    const avlBalMatch = /(?:Your\s+)?Avl\s+Bal\s+is\s+INR\s+([\d,]+(?:\.\d{2})?)/i.exec(message);
    if (avlBalMatch?.[1]) {
      const val = parseFloat(avlBalMatch[1].replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    // Pattern 2: "available bal is INR xyz"
    const availableBalMatch = /available\s+bal\s+is\s+INR\s+([\d,]+(?:\.\d{2})?)/i.exec(message);
    if (availableBalMatch?.[1]) {
      const val = parseFloat(availableBalMatch[1].replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    return super.extractBalance(message);
  }
}
