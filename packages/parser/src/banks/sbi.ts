// Exact 1:1 port of SBIBankParser.kt from Cashiro parser-core
import { BankParser } from '../base-parser.js';
import type { ParsedTransaction, BalanceUpdateInfo, TransactionType } from '../types.js';

function parseNum(str: string): number | null {
  const n = parseFloat(str.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export class SBIBankParser extends BankParser {
  getBankName(): string {
    return 'State Bank of India';
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      u.includes('SBI') ||
      u.includes('SBIINB') ||
      u.includes('SBIUPI') ||
      u.includes('SBICRD') ||
      u.includes('ATMSBI') ||
      u === 'SBIBK' ||
      u === 'SBIBNK' ||
      /^[A-Z]{2}-SBIBK-S$/.test(u) ||
      /^[A-Z]{2}-SBIBK-[TPG]$/.test(u) ||
      /^[A-Z]{2}-SBIBK$/.test(u) ||
      /^[A-Z]{2}-SBI$/.test(u) ||
      u.includes('CBSSBI')
    );
  }

  private isCreditCardMessage(sender: string): boolean {
    return sender.toUpperCase().includes('SBICRD');
  }

  private extractCreditCardLast4(message: string): string | null {
    const m = /ending\s+with\s+(\d{4})/i.exec(message);
    return m?.[1] ?? null;
  }

  override parse(smsBody: string, sender: string, timestamp: number): ParsedTransaction | null {
    const parsed = super.parse(smsBody, sender, timestamp);
    if (!parsed) return null;

    if (this.isCreditCardMessage(sender)) {
      const cardLast4 = this.extractCreditCardLast4(smsBody) ?? parsed.accountLast4;
      const creditLimit = this.extractAvailableLimit(smsBody) ?? parsed.creditLimit;
      const lower = smsBody.toLowerCase();
      const transactionType: TransactionType =
        lower.includes('payment of') && lower.includes('credited to your sbi credit card')
          ? 'INCOME'
          : 'CREDIT';
      const merchant = lower.includes('via bbps') ? 'BBPS Payment' : parsed.merchant;
      return {
        ...parsed,
        accountLast4: cardLast4,
        type: transactionType,
        merchant: merchant ?? parsed.merchant,
        creditLimit: creditLimit ?? null,
        isFromCard: true,
      };
    }

    return parsed;
  }

  protected override extractAvailableLimit(message: string): number | null {
    const patterns = [
      /available\s+limit\s+is\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
      /Your\s+available\s+limit\s+is\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
    ];
    for (const pattern of patterns) {
      const m = pattern.exec(message);
      if (m?.[1]) {
        const val = parseNum(m[1]);
        if (val !== null) return val;
      }
    }
    return super.extractAvailableLimit(message);
  }

  protected override extractAmount(message: string): number | null {
    const patterns: [RegExp, number][] = [
      [/has\s+credit\s+for\s+[^.\n]+?\s+of\s+(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i, 1],
      [/has\s+a\s+credit\s+by\s+[^.\n]+?\s+of\s+(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i, 1],
      [/Credited\s+(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i, 1],
      [/has\s+a\s+debit\s+by\s+transfer\s+of\s+(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i, 1],
      [/debit\s+(?:of|for)\s+(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i, 1],
      [/transaction\s+number\s+\d+\s+for\s+(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i, 1],
      [/payment\s+of\s+(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i, 1],
      [/(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)\s+spent/i, 1],
      [/debited\s+by\s+([0-9,]+(?:\.\d{1,2})?)/i, 1],
      [/credited\s+by\s+(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{1,2})?)/i, 1],
      [/(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)\s+(?:has\s+been\s+)?debited/i, 1],
      [/(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)\s+(?:has\s+been\s+)?credited/i, 1],
      [/withdrawn\s+(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i, 1],
      [/(?:transferred|transfer)\s+(?:of\s+)?(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i, 1],
      [/paid\s+to\s+[\w.-]+@[\w]+\s+(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i, 1],
      [/ATM\s+withdrawal\s+of\s+(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i, 1],
      [/Yono\s+Cash\s+(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i, 1],
    ];
    for (const [pattern, group] of patterns) {
      const m = pattern.exec(message);
      if (m?.[group]) {
        const val = parseNum(m[group]);
        if (val !== null) return val;
      }
    }
    return super.extractAmount(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();
    if (lower.includes('debited for')) return 'EXPENSE';
    if (lower.includes('is debited')) return 'EXPENSE';
    if (lower.includes('withdrawn')) return 'EXPENSE';
    if (lower.includes('transferred')) return 'EXPENSE';
    if (lower.includes('transfer')) return 'EXPENSE';
    if (lower.includes('debit')) return 'EXPENSE';
    if (lower.includes('paid to')) return 'EXPENSE';
    if (lower.includes('atm withdrawal')) return 'EXPENSE';
    if (lower.includes('by sbi debit card')) return 'EXPENSE';
    if (lower.includes('received transfer')) return 'INCOME';
    if (lower.includes('credited')) return 'INCOME';
    if (lower.includes('has credit for')) return 'INCOME';
    if (lower.includes('has a credit by')) return 'INCOME';
    return super.extractTransactionType(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    const doneAtMatch = /done\s+at\s+([^.\n]+?)(?:\s+on\s+|$)/i.exec(message);
    if (doneAtMatch?.[1]) {
      const m = this.cleanMerchantName(doneAtMatch[1].trim());
      if (this.isValidMerchantName(m)) return m;
    }

    const trfMatch = /trf\s+to\s+([^.\n]+?)(?:\s+Ref|\s+ref|$)/i.exec(message);
    if (trfMatch?.[1]) {
      const m = this.cleanMerchantName(trfMatch[1].trim());
      if (this.isValidMerchantName(m)) return m;
    }

    const transferFromMatch = /transfer\s+from\s+([^.\n]+?)(?:\s+Ref|\s+ref|$)/i.exec(message);
    if (transferFromMatch?.[1]) {
      const m = this.cleanMerchantName(transferFromMatch[1].trim());
      if (this.isValidMerchantName(m)) return m;
    }

    const upiMerchantMatch = /paid\s+to\s+([\w.-]+)@[\w]+/i.exec(message);
    if (upiMerchantMatch?.[1]) {
      const m = this.cleanMerchantName(upiMerchantMatch[1]);
      if (this.isValidMerchantName(m)) return m;
    }

    const yonoAtmMatch = /w\/d@SBI\s+ATM\s+([A-Z0-9]+)/i.exec(message);
    if (yonoAtmMatch?.[1]) return `YONO Cash ATM - ${yonoAtmMatch[1]}`;

    const atmMatch = /ATM\s+(?:withdrawal\s+)?(?:at\s+)?([^.\n]+?)(?:\s+on|\s+Avl)/i.exec(message);
    if (atmMatch?.[1]) {
      const m = this.cleanMerchantName(atmMatch[1]);
      if (this.isValidMerchantName(m)) return `ATM - ${m}`;
    }

    const neftMatch = /(?:NEFT|IMPS|RTGS)[^:]*:\s*([^.\n]+?)(?:\s+Ref|\s+on|$)/i.exec(message);
    if (neftMatch?.[1]) {
      const m = this.cleanMerchantName(neftMatch[1]);
      if (this.isValidMerchantName(m)) return m;
    }

    // "on DD/MM/YY -MERCHANT" (reverse ATM withdrawal / suffix merchant)
    const reverseAtmMatch = /on\s+\d{2}\/\d{2}\/\d{2,4}\s*-\s*([^.\n]+)/i.exec(message);
    if (reverseAtmMatch?.[1]) {
      const m = this.cleanMerchantName(reverseAtmMatch[1].trim());
      if (this.isValidMerchantName(m)) return m;
    }

    const creditForMerchantMatch = /has\s+credit\s+for\s+([^.\n]+?)\s+of/i.exec(message);
    if (creditForMerchantMatch?.[1]) {
      const m = this.cleanMerchantName(creditForMerchantMatch[1].trim());
      if (this.isValidMerchantName(m)) return m;
    }

    const creditByMerchantMatch = /has\s+a\s+credit\s+by\s+([^.\n]+?)\s+of/i.exec(message);
    if (creditByMerchantMatch?.[1]) {
      const m = this.cleanMerchantName(creditByMerchantMatch[1].trim());
      if (this.isValidMerchantName(m)) return m;
    }

    return super.extractMerchant(message, sender);
  }

  protected override extractAccountLast4(message: string): string | null {
    const debitCardMatch = /by\s+SBI\s+Debit\s+Card\s+([\w-]+)/i.exec(message);
    if (debitCardMatch?.[1]) {
      const cardInfo = debitCardMatch[1];
      if (/^\d{4}$/.test(cardInfo)) return cardInfo;
      const digits = cardInfo.replace(/\D/g, '');
      return digits.length >= 4 ? digits.slice(-4) : cardInfo;
    }

    const pattern1Match = /A\/c\s+(?:no\.?\s+)?([X*]*\d+)/i.exec(message);
    if (pattern1Match?.[1]) {
      const digits = pattern1Match[1].replace(/\D/g, '');
      return digits.length >= 4 ? digits.slice(-4) : digits;
    }

    const pattern2Match = /A\/c\s+ending\s+(\d{4})/i.exec(message);
    if (pattern2Match?.[1]) return pattern2Match[1];

    const pattern2aMatch = /AC\s+[X*]*(\d+)/i.exec(message);
    if (pattern2aMatch?.[1]) {
      const digits = pattern2aMatch[1].replace(/\D/g, '');
      return digits.length >= 4 ? digits.slice(-4) : digits;
    }

    const pattern4Match = /a\/c\s+[X*]*(\d{4})/i.exec(message);
    if (pattern4Match?.[1]) return pattern4Match[1];

    return super.extractAccountLast4(message);
  }

  protected override extractBalance(message: string): number | null {
    const p1 = /Avl\s+Bal\s+(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (p1?.[1]) return parseNum(p1[1]);

    const p2 = /Your\s+updated\s+available\s+balance\s+is\s+(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (p2?.[1]) return parseNum(p2[1]);

    const p3 = /Available\s+Balance:?\s+(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (p3?.[1]) return parseNum(p3[1]);

    const p4 = /Bal:?\s+(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (p4?.[1]) return parseNum(p4[1]);

    return super.extractBalance(message);
  }

  protected override extractReference(message: string): string | null {
    const txnNumberMatch = /transaction\s+number\s+([\w-]+)/i.exec(message);
    if (txnNumberMatch?.[1]) return txnNumberMatch[1];

    const p1 = /Ref\s+No\.?\s*(\w+)/i.exec(message);
    if (p1?.[1]) return p1[1];

    const p2 = /Txn#\s*(\w+)/i.exec(message);
    if (p2?.[1]) return p2[1];

    const p3 = /transaction\s+ID:?\s*(\w+)/i.exec(message);
    if (p3?.[1]) return p3[1];

    return super.extractReference(message);
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();
    if (lower.includes('e-statement of sbi credit card')) return false;
    if (lower.includes('is due for')) return false;
    if (
      lower.includes('sbi card application') ||
      lower.includes('process your app.no') ||
      lower.includes('track your application status')
    ) return false;
    if (this.isUPIMandateNotification(message)) return false;
    if (lower.includes('by sbi debit card')) return true;
    if (
      lower.includes('debit') ||
      lower.includes('transfer') ||
      lower.includes('credit') ||
      lower.includes('credited')
    ) return true;
    return super.isTransactionMessage(message);
  }

  isUPIMandateNotification(message: string): boolean {
    const lower = message.toLowerCase();
    return lower.includes('upi-mandate') && lower.includes('successfully created');
  }

  override isBalanceUpdateNotification(message: string): boolean {
    const lower = message.toLowerCase();
    const isStatement =
      lower.includes('statement is generated') ||
      (lower.includes('statement') && lower.includes('generated'));
    const hasAmountDue =
      lower.includes('total amount due') ||
      lower.includes('total due') ||
      lower.includes('minimum amount due');
    return isStatement && hasAmountDue;
  }

  override parseBalanceUpdate(message: string): BalanceUpdateInfo | null {
    if (!this.isBalanceUpdateNotification(message)) return null;
    const cardLast4 = this.extractCreditCardLast4(message);
    if (!cardLast4) return null;

    const totalDuePatterns = [
      /Total\s+Amount\s+Due:?\s*Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
      /Total\s+Due:?\s*Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
      /Total\s+Amount\s+Due:?\s*INR\s*([0-9,]+(?:\.\d{2})?)/i,
    ];

    let outstanding: number | null = null;
    for (const pattern of totalDuePatterns) {
      const m = pattern.exec(message);
      if (m?.[1]) {
        outstanding = parseNum(m[1]);
        if (outstanding !== null) break;
      }
    }
    if (outstanding === null) return null;

    return {
      bankName: this.getBankName(),
      accountLast4: cardLast4,
      balance: outstanding,
      asOfDate: null,
      isCreditCard: true,
    };
  }
}
