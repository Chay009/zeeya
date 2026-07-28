import { BankParser } from '../base-parser.js';
import { CompiledPatterns } from '../patterns.js';
import type { BalanceUpdateInfo, MandateInfo, TransactionType } from '../types.js';

export interface EMandateInfo extends MandateInfo {
  amount: number;
  nextDeductionDate: string | null;
  merchant: string;
  umn: string | null;
  dateFormat: string;
}

export class HDFCBankParser extends BankParser {
  getBankName(): string {
    return 'HDFC Bank';
  }

  canHandle(sender: string): boolean {
    const normalizedSender = sender.toUpperCase();
    if (['HDFCBK', 'HDFCBANK', 'HDFC', 'HDFCB'].includes(normalizedSender)) return true;
    return CompiledPatterns.HDFC.DLT_PATTERNS.some(p => p.test(normalizedSender));
  }

  parseEMandateSubscription(message: string): EMandateInfo | null {
    if (!message.toLowerCase().includes('e-mandate')) return null;
    const amountMatch = CompiledPatterns.HDFC.AMOUNT_WILL_DEDUCT.exec(message);
    if (!amountMatch) return null;
    const amountStr = (amountMatch[1] ?? '').replace(/,/g, '');
    const amount = parseFloat(amountStr);
    if (isNaN(amount)) return null;
    const deductionMatch = CompiledPatterns.HDFC.DEDUCTION_DATE.exec(message);
    const deductionDate = deductionMatch?.[1] ?? null;
    const merchantMatch = CompiledPatterns.HDFC.MANDATE_MERCHANT.exec(message);
    const merchant = merchantMatch
      ? this.cleanMerchantName((merchantMatch[1] ?? '').trim())
      : 'Unknown Subscription';
    const umnMatch = CompiledPatterns.HDFC.UMN_PATTERN.exec(message);
    const umn = umnMatch?.[1] ?? null;
    return { amount, nextDeductionDate: deductionDate, merchant, umn, dateFormat: 'dd/MM/yy' };
  }

  parseFutureDebit(message: string): EMandateInfo | null {
    if (!message.toLowerCase().includes('will be deducted')) return null;
    const amountMatch = CompiledPatterns.HDFC.AMOUNT_WILL_DEDUCT.exec(message);
    if (!amountMatch) return null;
    const amountStr = (amountMatch[1] ?? '').replace(/,/g, '');
    const amount = parseFloat(amountStr);
    if (isNaN(amount)) return null;
    const deductionMatch = CompiledPatterns.HDFC.DEDUCTION_DATE.exec(message);
    const deductionDate = deductionMatch?.[1] ?? null;
    const merchantMatch = CompiledPatterns.HDFC.MANDATE_MERCHANT.exec(message);
    const merchant = merchantMatch
      ? this.cleanMerchantName((merchantMatch[1] ?? '').trim())
      : 'Unknown Subscription';
    const umnMatch = CompiledPatterns.HDFC.UMN_PATTERN.exec(message);
    const umn = umnMatch?.[1] ?? null;
    return { amount, nextDeductionDate: deductionDate, merchant, umn, dateFormat: 'dd/MM/yy' };
  }

  protected isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();
    if (lower.includes('e-mandate') && !lower.includes('debited')) return false;
    if (lower.includes('will be deducted') || lower.includes('will be debited')) return false;
    if (lower.includes('bill alert') || (lower.includes('bill') && lower.includes('is due on'))) return false;
    if (lower.includes('bill') && lower.includes('has been generated')) return false;
    if (lower.includes('has requested') || lower.includes('payment request') || lower.includes('collect request') || lower.includes('ignore if already paid')) return false;
    if (lower.includes('received towards your credit card')) return false;
    if (lower.includes('payment') && lower.includes('credited to your card')) return false;
    if (lower.includes('otp') || lower.includes('one time password') || lower.includes('verification code')) return false;
    if (lower.includes('offer') || lower.includes('discount') || lower.includes('cashback offer') || lower.includes('win ')) return false;

    const hdfcKeywords = [
      'debited', 'credited', 'withdrawn', 'deposited',
      'spent', 'received', 'transferred', 'paid',
      'sent', 'deducted', 'txn',
    ];
    return hdfcKeywords.some(kw => lower.includes(kw));
  }

  isBalanceUpdateNotification(message: string): boolean {
    const lower = message.toLowerCase();
    const hasBalanceCue =
      lower.includes('avl bal') ||
      lower.includes('available bal') ||
      lower.includes('account balance') ||
      lower.includes('a/c balance') ||
      lower.includes('updated balance');
    const hasTxnVerb =
      lower.includes('debited') ||
      lower.includes('credited') ||
      lower.includes('withdrawn') ||
      lower.includes('spent') ||
      lower.includes('transferred') ||
      lower.includes('payment of');
    return hasBalanceCue && !hasTxnVerb;
  }

  parseBalanceUpdate(message: string): BalanceUpdateInfo | null {
    if (!this.isBalanceUpdateNotification(message)) return null;
    const accountLast4 = this.extractAccountLast4(message);
    if (!accountLast4) return null;
    const balance = this.extractBalance(message);
    if (balance === null) return null;
    return { bankName: this.getBankName(), accountLast4, balance, asOfDate: null, isCreditCard: false };
  }

  protected extractAmount(message: string): number | null {
    const patterns = [
      /(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)\s+(?:has been )?(?:debited|credited|spent)/i,
      /(?:debited|credited|spent)\s+(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i,
      /(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i,
    ];
    for (const pattern of patterns) {
      const match = pattern.exec(message);
      if (match) {
        const amountStr = (match[1] ?? '').replace(/,/g, '');
        const val = parseFloat(amountStr);
        if (!isNaN(val)) return val;
        return null;
      }
    }
    return super.extractAmount(message);
  }

  protected extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();
    if (lower.includes('sent') && lower.includes('from hdfc')) return 'EXPENSE';
    if (lower.includes('spent') && lower.includes('from hdfc bank card')) return 'EXPENSE';
    if (lower.includes('payment') && lower.includes('credit card')) return 'EXPENSE';
    if (lower.includes('towards') && lower.includes('credit card')) return 'EXPENSE';
    if (lower.includes('debited')) return 'EXPENSE';
    if (lower.includes('withdrawn') && !lower.includes('block cc')) return 'EXPENSE';
    if (lower.includes('spent') && !lower.includes('card')) return 'EXPENSE';
    if (lower.includes('charged')) return 'EXPENSE';
    if (lower.includes('avl limit') || lower.includes('avl lmt')) return 'CREDIT';
    if (lower.includes('credited')) return 'INCOME';
    if (lower.includes('received')) return 'INCOME';
    return super.extractTransactionType(message);
  }

  protected extractMerchant(message: string, sender: string): string | null {
    // "Sent Rs.X From HDFC Bank A/C *1234 To <payee> On DD/MM/YY"
    if (/Sent Rs/i.test(message) && /From HDFC Bank/i.test(message)) {
      const sentToMatch = /\bTo\s+(.+?)\s+On\s+\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/i.exec(message);
      if (sentToMatch?.[1]) {
        const payee = (sentToMatch[1] ?? '').trim();
        const merchant = payee.includes('@')
          ? (() => {
              const vpaName = payee.split('@')[0]?.trim() ?? '';
              return /[a-zA-Z]/.test(vpaName) ? this.cleanMerchantName(vpaName) : 'UPI Payee';
            })()
          : this.cleanMerchantName(payee);
        if (this.isValidMerchantName(merchant)) return merchant;
        if (payee.includes('@')) return 'UPI Payee';
      }
    }

    const salaryMatch = CompiledPatterns.HDFC.SALARY_PATTERN.exec(message);
    if (salaryMatch) {
      const m = this.cleanMerchantName((salaryMatch[1] ?? '').trim());
      if (this.isValidMerchantName(m)) return m;
    }

    const simpleSalaryMatch = CompiledPatterns.HDFC.SIMPLE_SALARY_PATTERN.exec(message);
    if (simpleSalaryMatch) {
      const m = this.cleanMerchantName((simpleSalaryMatch[1] ?? '').trim());
      if (this.isValidMerchantName(m)) return `Salary - ${m}`;
    }

    const vpaWithNameMatch = CompiledPatterns.HDFC.VPA_WITH_NAME.exec(message);
    if (vpaWithNameMatch) {
      const m = this.cleanMerchantName((vpaWithNameMatch[1] ?? '').trim());
      if (this.isValidMerchantName(m)) return m;
    }

    const infoMatch = CompiledPatterns.HDFC.INFO_PATTERN.exec(message);
    if (infoMatch) {
      const m = this.cleanMerchantName((infoMatch[1] ?? '').trim());
      if (this.isValidMerchantName(m)) return m;
    }

    const debitForMatch = CompiledPatterns.HDFC.DEBIT_FOR_PATTERN.exec(message);
    if (debitForMatch) {
      const m = this.cleanMerchantName((debitForMatch[1] ?? '').trim());
      if (this.isValidMerchantName(m)) return m;
    }

    const spentMatch = CompiledPatterns.HDFC.SPENT_PATTERN.exec(message);
    if (spentMatch) {
      const m = this.cleanMerchantName((spentMatch[1] ?? '').trim());
      if (this.isValidMerchantName(m)) return m;
    }

    const vpaMatch = CompiledPatterns.HDFC.VPA_PATTERN.exec(message);
    if (vpaMatch) {
      const m = this.cleanMerchantName((vpaMatch[1] ?? '').trim());
      if (this.isValidMerchantName(m)) return m;
    }

    const mandateMatch = CompiledPatterns.HDFC.MANDATE_PATTERN.exec(message);
    if (mandateMatch) {
      const m = this.cleanMerchantName((mandateMatch[1] ?? '').trim());
      if (this.isValidMerchantName(m)) return m;
    }

    return super.extractMerchant(message, sender);
  }

  protected extractReference(message: string): string | null {
    const upiRefMatch = CompiledPatterns.HDFC.UPI_REF_NO.exec(message);
    if (upiRefMatch) return upiRefMatch[1] ?? null;
    const refSimpleMatch = CompiledPatterns.HDFC.REF_SIMPLE.exec(message);
    if (refSimpleMatch) return refSimpleMatch[1] ?? null;
    const refNoMatch = CompiledPatterns.HDFC.REF_NO.exec(message);
    if (refNoMatch) return refNoMatch[1] ?? null;
    const refEndMatch = CompiledPatterns.HDFC.REF_END.exec(message);
    if (refEndMatch) return refEndMatch[1] ?? null;
    return super.extractReference(message);
  }

  protected extractAccountLast4(message: string): string | null {
    const depositedMatch = CompiledPatterns.HDFC.ACCOUNT_DEPOSITED.exec(message);
    if (depositedMatch) {
      const digits = (depositedMatch[1] ?? '').replace(/\D/g, '');
      if (digits.length >= 4) return digits.slice(-4);
    }
    const fromMatch = CompiledPatterns.HDFC.ACCOUNT_FROM.exec(message);
    if (fromMatch) {
      const digits = (fromMatch[1] ?? '').replace(/\D/g, '');
      if (digits.length >= 4) return digits.slice(-4);
    }
    const simpleMatch = CompiledPatterns.HDFC.ACCOUNT_SIMPLE.exec(message);
    if (simpleMatch) {
      const digits = (simpleMatch[1] ?? '').replace(/\D/g, '');
      if (digits.length >= 4) return digits.slice(-4);
    }
    const genericMatch = CompiledPatterns.HDFC.ACCOUNT_GENERIC.exec(message);
    if (genericMatch) {
      const digits = (genericMatch[1] ?? '').replace(/\D/g, '');
      if (digits.length >= 4) return digits.slice(-4);
    }
    return super.extractAccountLast4(message);
  }

  protected extractBalance(message: string): number | null {
    const patterns = [
      /Avl\s+Bal\s+(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i,
      /Available\s+Balance\s*:?\s*(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i,
    ];
    for (const pattern of patterns) {
      const match = pattern.exec(message);
      if (match) {
        const str = (match[1] ?? '').replace(/,/g, '');
        const val = parseFloat(str);
        if (!isNaN(val)) return val;
        return null;
      }
    }
    return super.extractBalance(message);
  }

  protected extractAvailableLimit(message: string): number | null {
    const patterns = [
      /Avl\s+Lmt:?\s*(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i,
      /Avl\s+Limit:?\s*(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i,
      /Available\s+(?:Credit\s+)?Limit:?\s*(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i,
    ];
    for (const pattern of patterns) {
      const match = pattern.exec(message);
      if (match) {
        const str = (match[1] ?? '').replace(/,/g, '');
        const val = parseFloat(str);
        if (!isNaN(val)) return val;
        return null;
      }
    }
    return super.extractAvailableLimit(message);
  }
}
