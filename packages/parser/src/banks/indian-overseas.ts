// Exact 1:1 port of IndianOverseasBankParser.kt from Cashiro parser-core
import { BankParser } from '../base-parser.js';
import type { TransactionType } from '../types.js';

function parseNum(str: string): number | null {
  const n = parseFloat(str.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export class IndianOverseasBankParser extends BankParser {
  getBankName(): string {
    return 'Indian Overseas Bank';
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return u.includes('IOB') || u.includes('IOBCHN');
  }

  protected override extractAmount(message: string): number | null {
    const patterns: RegExp[] = [
      /Rs\.?\s*([0-9,]+(?:\.\d{2})?)\s+Debited\s+to\s+(?:SB|CA|CC)-/i,
      /Rs\.?\s*([0-9,]+(?:\.\d{2})?)\s+Credited\s+to\s+(?:SB|CA|CC)-/i,
      /credited\s+by\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
      /debited\s+by\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
      /credited\s+with\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
      /debited\s+for\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
      /debited\s+towards\s+[Xx]*\d{2,4}\s+for\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
    ];

    for (const pattern of patterns) {
      const m = pattern.exec(message);
      if (m?.[1]) {
        const val = parseNum(m[1]);
        if (val !== null) return val;
      }
    }

    return super.extractAmount(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();
    if (lower.includes('credited by')) return 'INCOME';
    if (lower.includes('credited with')) return 'INCOME';
    if (lower.includes('is credited')) return 'INCOME';
    if (lower.includes('credited to')) return 'INCOME';
    if (lower.includes('debited by')) return 'EXPENSE';
    if (lower.includes('debited for')) return 'EXPENSE';
    if (lower.includes('is debited')) return 'EXPENSE';
    if (lower.includes('debited to')) return 'EXPENSE';
    if (lower.includes('debited towards')) return 'EXPENSE';
    return super.extractTransactionType(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    // Bracketed description: [NEFT-CITI- ], [UPI/636773 ], [CHRGS- SMS ], [IMPS/ 123456]
    const bracketMatch = /\[\s*([^\]]+?)\s*]/.exec(message);
    if (bracketMatch) {
      const description = (bracketMatch?.[1] ?? '').trim();
      // Pure IMPS reference — skip merchant extraction from bracket
      if (/^IMPS\/\s*\d+$/i.test(description)) {
        // fall through to next patterns
      } else {
        let normalizedDescription: string;
        if (/CHRGS/i.test(description) && /SMS/i.test(description)) {
          normalizedDescription = 'SMS Charges';
        } else if (/^NEFT-/i.test(description)) {
          const parts = description.split('-');
          const part1 = parts[1];
          normalizedDescription =
            part1 !== undefined && part1.trim() !== '' ? part1 : description;
        } else if (/^UPI\//i.test(description)) {
          normalizedDescription = 'UPI';
        } else {
          normalizedDescription = description;
        }
        const merchant = this.cleanMerchantName(normalizedDescription);
        if (this.isValidMerchantName(merchant)) return merchant;
      }
    }

    // Payee pattern: "debited for payee X for Rs."
    const payeeMatch = /debited\s+for\s+payee\s+(.+?)\s+for\s+Rs\.?/i.exec(message);
    if (payeeMatch) {
      const payee = (payeeMatch?.[1] ?? '').trim();
      let merchant: string;
      if (payee.includes('@')) {
        const vpaName = payee.split('@')[0]?.trim() ?? '';
        merchant = /[a-zA-Z]/.test(vpaName)
          ? this.cleanMerchantName(vpaName)
          : 'UPI Payee';
      } else {
        merchant = this.cleanMerchantName(payee);
      }
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    // UPI payer pattern: "from X(UPI Ref ..." or "from X<end>"
    const upiPayerMatch = /from\s+([^(]+?)(?:\(UPI|$)/i.exec(message);
    if (upiPayerMatch) {
      const payer = (upiPayerMatch?.[1] ?? '').trim();
      if (payer.includes('@')) {
        const parts = payer.split('-');
        const namePart = parts[0]?.trim() ?? '';
        const upiIdPart = parts[1]?.trim() ?? '';
        if (parts.length >= 2 && upiIdPart) {
          return `UPI - ${this.cleanMerchantName(namePart)} (${upiIdPart})`;
        } else {
          return `UPI - ${this.cleanMerchantName(payer)}`;
        }
      } else {
        const cleaned = this.cleanMerchantName(payer);
        if (this.isValidMerchantName(cleaned)) return cleaned;
      }
    }

    // Payer remark
    const remarkMatch = /Payer\s+Remark\s*-\s*([^-]+)/i.exec(message);
    if (remarkMatch) {
      const remark = this.cleanMerchantName((remarkMatch?.[1] ?? '').trim());
      if (
        this.isValidMerchantName(remark) &&
        remark.toLowerCase() !== 'paid via supe'
      ) {
        return remark;
      }
    }

    // Generic debit "to/for" pattern
    if (/debited/i.test(message)) {
      const toMatch = /(?:to|for)\s+([^,.-]+)/i.exec(message);
      if (toMatch) {
        const merchant = this.cleanMerchantName((toMatch?.[1] ?? '').trim());
        if (this.isValidMerchantName(merchant)) return merchant;
      }
    }

    return super.extractMerchant(message, sender);
  }

  protected override extractAccountLast4(message: string): string | null {
    const patterns: RegExp[] = [
      /\b(?:SB|CA|CC)-[xX]*(\d{2,4})\b/i,
      /a\/c\s+no\.\s+[Xx]*(\d{2,4})/i,
      /a\/c:?\s*[Xx]*(\d{2,4})/i,
      /account\s+has\s+been\s+debited\s+towards\s+[Xx]*(\d{2,4})/i,
      /IOB\s+account\s+[Xx]*(\d{2,4})/i,
      /Acct:\s*\d*[xX]+(\d{2,4})/i,
    ];

    for (const pattern of patterns) {
      const m = pattern.exec(message);
      if (m?.[1]) {
        const digits = m[1];
        return digits.length >= 4 ? digits.slice(-4) : digits;
      }
    }

    return super.extractAccountLast4(message);
  }

  protected override extractBalance(message: string): number | null {
    const p1 = /AcBal:\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (p1?.[1]) {
      const val = parseNum(p1[1]);
      if (val !== null) return val;
    }

    const p2 =
      /Avl\s+Balance\s+in\s+Acct:[^\s]+\s+is\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i.exec(
        message,
      );
    if (p2?.[1]) {
      const val = parseNum(p2[1]);
      if (val !== null) return val;
    }

    return super.extractBalance(message);
  }

  protected override extractReference(message: string): string | null {
    // Bracket ref: [UPI/nnn], [IMPS/ nnn], [UPI/IMPS/ nnn]
    const bracketRefMatch =
      /\[(?:UPI|IMPS)(?:\/(?:UPI|IMPS))?\/\s*(\d+)/i.exec(message);
    if (bracketRefMatch?.[1]) return bracketRefMatch[1];

    // "(UPI Ref no 560699645381)"
    const upiRefMatch = /\(UPI\s+Ref\s+no\s+(\d+)\)/i.exec(message);
    if (upiRefMatch?.[1]) return upiRefMatch[1];

    // "UPI Ref no 560699645381" (without parentheses)
    const altUpiRefMatch = /UPI\s+Ref\s+no\s+(\d+)/i.exec(message);
    if (altUpiRefMatch?.[1]) return altUpiRefMatch[1];

    return super.extractReference(message);
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();

    if (
      lower.includes('otp') ||
      lower.includes('verification') ||
      lower.includes('request') ||
      lower.includes('failed') ||
      lower.includes('will be debited') ||
      lower.includes('will be deducted') ||
      lower.includes('applicable sms charges') ||
      lower.includes('txn is not enabled') ||
      lower.includes('transaction declined') ||
      lower.includes('never respond')
    ) {
      return false;
    }

    if (
      lower.includes('is credited by') ||
      lower.includes('is debited by') ||
      lower.includes('debited to') ||
      lower.includes('credited to') ||
      lower.includes('credited with') ||
      lower.includes('debited for') ||
      lower.includes('debited towards')
    ) {
      return true;
    }

    return super.isTransactionMessage(message);
  }
}
