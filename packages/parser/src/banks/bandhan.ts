// 1:1 port of BandhanBankParser.kt from Cashiro parser-core
import { BankParser } from '../base-parser.js';
import type { TransactionType } from '../types.js';

export class BandhanBankParser extends BankParser {
  getBankName(): string {
    return 'Bandhan Bank';
  }

  canHandle(sender: string): boolean {
    const s = sender.toUpperCase();
    if (s.includes('BANDHAN')) return true;
    if (/^[A-Z]{2}-BDNSMS(?:-S)?$/.test(s)) return true;
    if (/^[A-Z]{2}-BANDHN(?:-S)?$/.test(s)) return true;
    return false;
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    // "towards UPI/CR/C224.../JOHN DOE/u on ..."
    const towardsPattern =
      /towards\s+([^.\n]+?)(?:\s+Value|\s+on|\s+dt|\s+at|\.|$)/i.exec(message);

    if (towardsPattern?.[1]) {
      let merchantRaw = towardsPattern[1].trim();

      // For UPI transactions with "/" delimiters, extract the last meaningful segment
      if (merchantRaw.includes('/')) {
        const segments = merchantRaw
          .split('/')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        const filtered = segments.filter(
          (seg) => seg.length >= 2 && /[a-zA-Z]/.test(seg) && !seg.match(/^UPI$/i),
        );
        const candidate =
          filtered.length > 0 ? filtered[filtered.length - 1] : segments[segments.length - 1];
        if (candidate) merchantRaw = candidate;
      }

      // Strip trailing \bu\b
      const cleaned = this.cleanMerchantName(merchantRaw.replace(/\bu\b/gi, '').trim());

      const normalized =
        cleaned.toLowerCase() === 'interest' ? 'Interest' : cleaned;

      if (this.isValidMerchantName(normalized)) return normalized;
    }

    return super.extractMerchant(message, sender);
  }

  protected override extractReference(message: string): string | null {
    // "UPI/CR/C224513287910" → ref = "C224513287910"
    const m = /UPI\/[A-Z]{2}\/([A-Z0-9]+)/i.exec(message);
    if (m?.[1]) return m[1];
    return super.extractReference(message);
  }

  protected override extractBalance(message: string): number | null {
    // "Clear Bal is INR 30,123.00"
    const m = /Clear\s+Bal\s+(?:is\s+)?(?:INR\s*)?([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (m?.[1]) {
      const val = parseFloat(m[1].replace(/,/g, ''));
      if (isFinite(val)) return val;
    }
    return super.extractBalance(message);
  }
}
