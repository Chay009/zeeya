// Exact 1:1 port of JKBankParser.kt from Cashiro parser-core
import { BankParser } from '../base-parser.js';
import type { ParsedTransaction, TransactionType } from '../types.js';
import { createHash } from 'node:crypto';

function parseNum(str: string): number | null {
  const n = parseFloat(str.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export class JKBankParser extends BankParser {
  getBankName(): string {
    return 'JK Bank';
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    const directMatches = new Set(['JKBANK', 'JKB', 'JKBANKL', 'JKBNK']);
    if (directMatches.has(u)) return true;
    return (
      /^[A-Z]{2}-JKBANK/.test(u) ||
      /^[A-Z]{2}-JKB/.test(u) ||
      /^[A-Z]{2}-JKBNK/.test(u) ||
      /^JKBANK-[A-Z]+$/.test(u) ||
      /^JKB-[A-Z]+$/.test(u)
    );
  }

  override parse(smsBody: string, sender: string, timestamp: number): ParsedTransaction | null {
    const parsed = super.parse(smsBody, sender, timestamp);
    if (!parsed) return null;
    const transactionHash = this.generateJKBankHash(parsed, smsBody, sender);
    return { ...parsed, transactionHash };
  }

  private generateJKBankHash(
    transaction: ParsedTransaction,
    smsBody: string,
    sender: string
  ): string {
    const normalizedAmount = transaction.amount.toFixed(2);
    const reference = transaction.reference;
    const transactionTime = this.extractTransactionTime(smsBody);

    let hashData: string;
    if (reference !== null && transactionTime !== null) {
      hashData = `JKBANK|${normalizedAmount}|REF:${reference}|TIME:${transactionTime}`;
    } else if (reference !== null) {
      hashData = `JKBANK|${normalizedAmount}|REF:${reference}`;
    } else if (transactionTime !== null && transaction.balance !== null) {
      hashData = `JKBANK|${normalizedAmount}|TIME:${transactionTime}|BAL:${transaction.balance.toFixed(2)}`;
    } else if (transactionTime !== null) {
      hashData = `JKBANK|${normalizedAmount}|TIME:${transactionTime}`;
    } else if (transaction.balance !== null) {
      hashData = `JKBANK|${normalizedAmount}|${sender}|BAL:${transaction.balance.toFixed(2)}`;
    } else {
      hashData = `${sender}|${normalizedAmount}|${transaction.timestamp}`;
    }

    return createHash('sha256').update(hashData).digest('hex');
  }

  private extractTransactionTime(message: string): string | null {
    // Kotlin iterates patterns in this order: time-only, date+time, date-only
    // Time only: "at 10:43"
    const timeMatch = /at\s+(\d{1,2}:\d{2}(?::\d{2})?)/i.exec(message);
    if (timeMatch?.[1]) return timeMatch[1];
    // Date and time: "on 17-Sep-24 at 10:43"
    const dateTimeMatch = /on\s+(\d{1,2}-\w{3}-\d{2,4})\s+at\s+(\d{1,2}:\d{2})/i.exec(message);
    if (dateTimeMatch?.[1] && dateTimeMatch?.[2]) {
      return `${dateTimeMatch[1]} ${dateTimeMatch[2]}`;
    }
    // Date only: "on 17-Sep-24"
    const dateMatch = /on\s+(\d{1,2}-\w{3}-\d{2,4})/i.exec(message);
    if (dateMatch?.[1]) return dateMatch[1];
    return null;
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    // IMPS Fund transfer – check for named sender
    if (/IMPS Fund transfer/i.test(message)) {
      const impsMatch = /Amt\s+received\s+from\s+([^h]+?)(?:\s+having\s+A\/C|$)/i.exec(message);
      if (impsMatch?.[1]) {
        const m = impsMatch[1].trim();
        if (m) return this.cleanMerchantName(m);
      }
      const fromMatch = /received\s+from\s+([^.\n]+?)(?:\s+having|\s+with|$)/i.exec(message);
      if (fromMatch?.[1]) {
        const m = fromMatch[1].trim();
        if (m) return this.cleanMerchantName(m);
      }
      return 'IMPS Transfer';
    }

    // TIN / Tax Information Network
    if (/TIN\/Tax Informat/i.test(message) || /TIN\/Tax Information/i.test(message)) {
      return 'Tax Information Network';
    }

    // ATM Recovery charge
    if (/ATM RECOVERY/i.test(message)) {
      return 'ATM Recovery Charge';
    }

    // "towards ..." pattern
    const towardsMatch =
      /towards\s+([^.\n]+?)(?:\.\s*Avl|\.\s*Available|\.\s*To\s+dispute|$)/i.exec(message);
    if (towardsMatch?.[1]) {
      const m = towardsMatch[1].trim();
      if (/TIN\/Tax Informat/i.test(m) || /TIN\/Tax Information/i.test(m)) {
        return 'Tax Information Network';
      }
      return this.cleanMerchantName(m);
    }

    // "Debited|Credited by INR X at HH:MM by TRANSFER_TYPE/..."
    const txnByMatch =
      /(?:Debited|Credited)\s+by\s+INR\s+[\d,]+(?:\.\d{2})?\s+at\s+[\d:]+\s+by\s+([^.\n]+?)(?:\.|Available|$)/i.exec(
        message
      );
    if (txnByMatch?.[1]) {
      const m = txnByMatch[1].trim();
      if (/CHRGS|CHARGES/i.test(m)) return null;
      if (/INDIAN CLEARING CORPO/i.test(m)) return 'Indian Clearing Corporation';
      if (/CLEARING CORPO/i.test(m)) return 'Clearing Corporation';
      if (/NSE CLEARING/i.test(m)) return 'NSE Clearing';
      if (/BSE CLEARING/i.test(m)) return 'BSE Clearing';
      if (/RTGS/i.test(m) && !/CLEARING/i.test(m)) return 'RTGS Transfer';
      if (/NEFT/i.test(m)) return 'NEFT Transfer';
      if (/IMPS/i.test(m)) return 'IMPS Transfer';
      if (/eTFR/i.test(m)) return 'Transfer';
      if (/mTFR/i.test(m)) {
        const mtfrMatch = /mTFR\/\d+\/(.+)/i.exec(m);
        if (mtfrMatch?.[1]) return this.cleanMerchantName(mtfrMatch[1].trim());
        return 'Mobile Transfer';
      }
      if (/TIN/i.test(m)) return 'Tax Information Network';
      const firstPart = m.split('/')[0];
      return this.cleanMerchantName(firstPart !== undefined ? firstPart : m);
    }

    // Fallback simple "by X" pattern — skip if starts with INR (that's the amount)
    const simpleByMatch = /by\s+([^.\n]+?)(?:\.|Available|$)/i.exec(message);
    if (simpleByMatch?.[1]) {
      const m = simpleByMatch[1].trim();
      if (!/^INR/i.test(m)) {
        return this.cleanMerchantName(m);
      }
    }

    // "via UPI from SENDER NAME on"
    if (/via UPI from/i.test(message)) {
      const fromMatch = /via\s+UPI\s+from\s+([^.\n]+?)\s+on/i.exec(message);
      if (fromMatch?.[1]) {
        const m = fromMatch[1].trim();
        if (this.isValidMerchantName(m)) return this.cleanMerchantName(m);
      }
    }

    // "mTFR/PHONE/SENDER NAME" pattern
    const mtfrMatch = /mTFR\/\d+\/([^.\n]+?)(?:\.|A\/C|$)/i.exec(message);
    if (mtfrMatch?.[1]) {
      const m = mtfrMatch[1].trim();
      if (this.isValidMerchantName(m)) return this.cleanMerchantName(m);
    }

    // "via UPI" — look for VPA or merchant before "via UPI"
    if (/via UPI/i.test(message)) {
      const vpaMatch = /to\s+([^@\s]+@[^\s]+)/i.exec(message);
      if (vpaMatch?.[1]) {
        const vpa = vpaMatch[1].trim();
        const merchantName = vpa.split('@')[0] ?? '';
        if (merchantName && merchantName.toLowerCase() !== 'upi') {
          return this.cleanMerchantName(merchantName);
        }
      }
      const toMerchantMatch = /to\s+([^.\n]+?)\s+via\s+UPI/i.exec(message);
      if (toMerchantMatch?.[1]) {
        const m = toMerchantMatch[1].trim();
        if (this.isValidMerchantName(m)) return this.cleanMerchantName(m);
      }
      return 'UPI';
    }

    // ATM / withdrawal
    if (/ATM/i.test(message) || /withdrawn/i.test(message)) {
      return 'ATM';
    }

    // Generic patterns: to/from/at/for
    const standardPatterns: RegExp[] = [
      /to\s+([^.\n]+?)\s+via/i,
      /from\s+([^.\n]+?)(?:\s+on|\s+Ref|$)/i,
      /at\s+([^.\n]+?)(?:\s+on|\s+Ref|$)/i,
      /for\s+([^.\n]+?)(?:\s+on|\s+Ref|$)/i,
    ];
    for (const pattern of standardPatterns) {
      const m = pattern.exec(message);
      if (m?.[1]) {
        const merchant = this.cleanMerchantName(m[1].trim());
        if (this.isValidMerchantName(merchant)) return merchant;
      }
    }

    return super.extractMerchant(message, sender);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();

    // Investment-related clearing corporations
    if (
      lower.includes('clearing corpo') ||
      lower.includes('indian clearing') ||
      lower.includes('nse clearing') ||
      lower.includes('bse clearing') ||
      lower.includes('iccl') ||
      lower.includes('nsccl')
    ) {
      if (lower.includes('credited') || lower.includes('debited')) return 'INVESTMENT';
      return null;
    }

    if (lower.includes('has been debited')) return 'EXPENSE';
    if (lower.includes('has been credited')) return 'INCOME';
    if (lower.includes('debited')) return 'EXPENSE';
    if (lower.includes('withdrawn')) return 'EXPENSE';
    if (lower.includes('spent')) return 'EXPENSE';
    if (lower.includes('charged')) return 'EXPENSE';
    if (lower.includes('paid')) return 'EXPENSE';
    if (lower.includes('purchase')) return 'EXPENSE';
    if (lower.includes('transferred')) return 'EXPENSE';
    if (lower.includes('credited')) return 'INCOME';
    if (lower.includes('deposited')) return 'INCOME';
    if (lower.includes('received')) return 'INCOME';
    if (lower.includes('refund')) return 'INCOME';
    if (lower.includes('cashback') && !lower.includes('earn cashback')) return 'INCOME';
    return null;
  }

  protected override extractReference(message: string): string | null {
    const patterns: RegExp[] = [
      /RRN\s+No\.?\s*(\d+)/i,
      /UPI\s+Ref[:\s]+(\d+)/i,
      /txn\s+Ref[:\s]+([A-Z0-9]+)/i,
      /Reference[:\s]+([A-Z0-9]+)/i,
      /Ref\s+No[:\s]+([A-Z0-9]+)/i,
    ];
    for (const pattern of patterns) {
      const m = pattern.exec(message);
      if (m?.[1]) return m[1].trim();
    }
    return super.extractReference(message);
  }

  protected override extractAccountLast4(message: string): string | null {
    const patterns: RegExp[] = [
      /Your\s+A\/c\s+[X]+(\d{4})/i,
      /JK\s+Bank\s+A\/c\s+no\.\s+[X]+(\d{4})/i,
      /A\/c\s+X{3}(\d{4})/i,
      /A\/c\s+[X]*(\d{4})/i,
      /Account\s+[X]+(\d{4})/i,
      /A\/c\s+ending\s+(\d{4})/i,
    ];
    for (const pattern of patterns) {
      const m = pattern.exec(message);
      if (m?.[1]) return m[1];
    }
    return super.extractAccountLast4(message);
  }

  protected override extractBalance(message: string): number | null {
    const patterns: RegExp[] = [
      /Available\s+Bal\s+is\s+INR\s*([0-9,]+(?:\.\d{2})?)\s*(?:Cr|Dr)?/i,
      /A\/C\s+Bal\s+is\s+INR\s*([0-9,]+(?:\.\d{2})?)\s*(?:Cr|Dr)?/i,
      /Avl\s+Bal[:\s]+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
      /Balance[:\s]+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
      /Bal\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
    ];
    for (const pattern of patterns) {
      const m = pattern.exec(message);
      if (m?.[1]) {
        const val = parseNum(m[1]);
        if (val !== null) return val;
      }
    }
    return super.extractBalance(message);
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();

    if (
      lower.includes('otp') ||
      lower.includes('one time password') ||
      lower.includes('verification code')
    )
      return false;

    if (
      lower.includes('offer') ||
      lower.includes('discount') ||
      lower.includes('cashback offer') ||
      lower.includes('win ')
    )
      return false;

    if (
      lower.includes('has requested') ||
      lower.includes('payment request') ||
      lower.includes('collect request') ||
      lower.includes('requesting payment')
    )
      return false;

    // Skip RTGS/NEFT/IMPS confirmation messages (separate from the actual debit/credit)
    if (lower.includes('your rtgs txn') && lower.includes('has been credited')) return false;
    if (lower.includes('your neft txn') && lower.includes('has been credited')) return false;
    if (lower.includes('your imps txn') && lower.includes('has been credited')) return false;

    // If message mentions fraud reporting, only treat as transaction if keywords are present
    if (lower.includes('if not done by you') || lower.includes('report immediately')) {
      const transactionKeywords = [
        'debited',
        'credited',
        'withdrawn',
        'deposited',
        'spent',
        'received',
        'transferred',
        'paid',
      ];
      return transactionKeywords.some(kw => lower.includes(kw));
    }

    const jkBankTransactionKeywords = [
      'has been debited',
      'has been credited',
      'debited',
      'credited',
      'withdrawn',
      'deposited',
      'spent',
      'received',
      'transferred',
      'paid',
    ];
    return jkBankTransactionKeywords.some(kw => lower.includes(kw));
  }
}
