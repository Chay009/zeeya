import { BankParser } from '../base-parser.js';
import type { BalanceUpdateInfo, TransactionType } from '../types.js';

export class IndusIndBankParser extends BankParser {
  getBankName(): string {
    return 'IndusInd Bank';
  }

  canHandle(sender: string): boolean {
    const s = sender.toUpperCase();
    if (s === 'INDUSB' || s === 'INDUSIND' || s.includes('INDUSIND BANK')) return true;
    if (/^[A-Z]{2}-INDUSB(?:-[A-Z])?$/.test(s)) return true;
    if (/^[A-Z]{2}-INDUSIND(?:-[A-Z])?$/.test(s)) return true;
    if (/^[A-Z]{2}-INDUS(?:[A-Z]{2,})?-[A-Z]$/.test(s)) return true;
    return false;
  }

  protected extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();
    if (lower.includes('spent')) return 'EXPENSE';
    if (lower.includes('debited')) return 'EXPENSE';
    if (lower.includes('purchase')) return 'EXPENSE';
    if (lower.includes('deposit')) return 'INVESTMENT';
    if (lower.includes('fd')) return 'INVESTMENT';
    if (lower.includes('ach')) return 'INVESTMENT';
    return super.extractTransactionType(message);
  }

  protected detectIsCard(message: string): boolean {
    const lower = message.toLowerCase();
    const isAchOrNach =
      lower.includes('ach db') || lower.includes('ach cr') || lower.includes('nach');
    if (isAchOrNach) return false;
    return super.detectIsCard(message);
  }

  isBalanceUpdateNotification(message: string): boolean {
    const lower = message.toLowerCase();
    const hasBalanceCue =
      lower.includes('avl bal') ||
      lower.includes('available bal') ||
      lower.includes('account balance') ||
      lower.includes('a/c balance');
    const hasTxnVerb = ['debited', 'credited', 'withdrawn', 'spent', 'transferred'].some(v =>
      lower.includes(v)
    );
    return hasBalanceCue && lower.includes('as on') && !hasTxnVerb;
  }

  parseBalanceUpdate(message: string): BalanceUpdateInfo | null {
    if (!this.isBalanceUpdateNotification(message)) return null;
    const accountLast4 = this.extractAccountLast4(message);
    if (!accountLast4) return null;

    let balance: number | null = null;

    const p1 = /Avl\s*BAL\s+of\s+INR\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (p1) {
      const val = parseFloat(p1[1]!.replace(/,/g, ''));
      if (!isNaN(val)) balance = val;
    }

    if (balance === null) {
      const p2 = /(?:Avl\s*BAL|Available\s+Balance(?:\s+is)?|Bal)[:\s]+INR\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
      if (p2) {
        const val = parseFloat(p2[1]!.replace(/,/g, ''));
        if (!isNaN(val)) balance = val;
      }
    }

    if (balance === null) return null;
    return {
      bankName: this.getBankName(),
      accountLast4,
      balance,
      asOfDate: null,
      isCreditCard: false,
    };
  }

  protected isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();
    if (lower.includes('net interest') && lower.includes('deposit no')) return false;
    return super.isTransactionMessage(message);
  }

  protected extractAmount(message: string): number | null {
    const verbAmountM = /(?:INR|Rs\.?|₹)\s*([0-9,]+(?:\.\d{2})?)\s+(?:debited|credited|spent|withdrawn|paid|purchase)/i.exec(message);
    if (verbAmountM) {
      const val = parseFloat(verbAmountM[1]!.replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }
    return super.extractAmount(message);
  }

  protected extractMerchant(message: string, sender: string): string | null {
    const towardsM = /towards\s+(\S+)/i.exec(message);
    if (towardsM) {
      let m = towardsM[1]!.trim().replace(/[.,;]+$/, '');
      if (m.includes('/')) m = m.split('/')[0]!;
      if (m.includes('@')) m = m.split('@')[0]!.trim();
      if (m.length > 0) return this.cleanMerchantName(m);
    }

    const fromAccountM = /from\s+account\s+[^\s/]+\/([^\s(]+)/i.exec(message);
    if (fromAccountM) {
      const merchant = fromAccountM[1]!.trim().replace(/[.,;)]+$/, '');
      if (merchant.length > 0) return this.cleanMerchantName(merchant);
    }

    const fromM = /from\s+(\S+)/i.exec(message);
    if (fromM) {
      const token = fromM[1]!.trim().replace(/[.,;]+$/, '');
      let m = token;
      if (m.includes('/')) m = m.split('/')[0]!;
      if (m.includes('@')) {
        m = m.split('@')[0]!.trim();
        if (m.length > 0) return this.cleanMerchantName(m);
      }
    }

    const atM = /at\s+([^\n]+?)(?:\s+Ref|\s+on|$)/i.exec(message);
    if (atM) {
      const merchant = atM[1]!.trim();
      if (merchant.length > 0) return this.cleanMerchantName(merchant);
    }

    const beforeBalM = /\/(?!\s)([^/.\s]+)\.\s*Bal/i.exec(message);
    if (beforeBalM) {
      const m = beforeBalM[1]!.trim();
      if (m.length > 0) return this.cleanMerchantName(m);
    }

    return super.extractMerchant(message, sender);
  }

  protected extractAccountLast4(message: string): string | null {
    const maskedM = /A\/?C\s+([0-9]{2,})[*xX#]+(\d{4,})/i.exec(message);
    if (maskedM) {
      const trailing = maskedM[2]!;
      return trailing.length >= 4 ? trailing.slice(-4) : trailing;
    }

    const starMaskM = /A\/?c\s+\*?X+\s*(\d{4,6})/i.exec(message);
    if (starMaskM) {
      const digits = starMaskM[1]!;
      return digits.length >= 4 ? digits.slice(-4) : digits;
    }

    const lower = message.toLowerCase();
    if (lower.includes('ach db') || lower.includes('ach cr') || lower.includes('nach')) return null;

    return super.extractAccountLast4(message);
  }

  protected extractBalance(message: string): number | null {
    const p1 = /Avl\s*BAL\s+of\s+INR\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (p1) {
      const val = parseFloat(p1[1]!.replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    const p2 = /(?:Avl\s*BAL|Available\s+Balance(?:\s+is)?|Bal)[:\s]+INR\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (p2) {
      const val = parseFloat(p2[1]!.replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    return super.extractBalance(message);
  }

  protected extractReference(message: string): string | null {
    const rrnM = /RRN[:\s]+([0-9]+)/i.exec(message);
    if (rrnM) return rrnM[1]!;

    const refNoM = /(?:IMPS\s+)?Ref\s+no\.?\s*([0-9]+)/i.exec(message);
    if (refNoM) return refNoM[1]!;

    return super.extractReference(message);
  }
}
