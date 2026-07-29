import { BankParser } from '../base-parser.js';
import type { TransactionType } from '../types.js';

export class NaviMutualFundParser extends BankParser {
  getBankName(): string {
    return 'Navi Mutual Fund';
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return u.includes('NAVIMF') || u.includes('NAVIMU') || u.includes('NAVIMUTUAL');
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();
    if (lower.includes('otp')) return false;
    const hasNavi = lower.includes('navi');
    if (hasNavi) {
      if (
        lower.includes('sip') ||
        lower.includes('invest') ||
        lower.includes('redemption') ||
        lower.includes('fund')
      ) {
        return true;
      }
    }
    return super.isTransactionMessage(message);
  }

  protected override extractAmount(message: string): number | null {
    const patterns = [
      /Rs\.?\s*([\d,]+(?:\.\d+)?)/i,
      /INR\s*([\d,]+(?:\.\d+)?)/i,
    ];
    for (const pattern of patterns) {
      const match = pattern.exec(message);
      if (match?.[1]) {
        const val = parseFloat((match[1] ?? '').replace(/,/g, ''));
        if (!isNaN(val)) return val;
      }
    }
    return null;
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();
    if (lower.includes('redemption')) return 'INCOME';
    if (
      lower.includes('sip') ||
      lower.includes('invest') ||
      lower.includes('lumpsum') ||
      lower.includes('purchase')
    ) {
      return 'INVESTMENT';
    }
    return null;
  }

  protected override extractMerchant(message: string, _sender: string): string | null {
    // "in Navi ... Fund" pattern
    const inPattern = /\bin\s+(Navi\s+[^.]+?(?:Fund|Scheme))/i;
    const inMatch = inPattern.exec(message);
    if (inMatch?.[1]) return (inMatch[1] ?? '').trim();

    // "from Navi ... Fund" pattern (redemption)
    const fromPattern = /\bfrom\s+(Navi\s+[^.]+?(?:Fund|Scheme))/i;
    const fromMatch = fromPattern.exec(message);
    if (fromMatch?.[1]) return (fromMatch[1] ?? '').trim();

    return null;
  }

  protected override extractReference(message: string): string | null {
    const patterns = [
      /Ref(?:\s*No)?\.?\s*:?\s*([A-Za-z0-9]+)/i,
      /Folio\s*:?\s*([A-Za-z0-9]+)/i,
    ];
    for (const pattern of patterns) {
      const match = pattern.exec(message);
      if (match?.[1]) return (match[1] ?? '').trim();
    }
    return null;
  }

  protected override extractBalance(_message: string): number | null {
    return null;
  }

  protected override extractAccountLast4(_message: string): string | null {
    return null;
  }
}
