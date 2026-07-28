import { BankParser } from '../base-parser.js';
import type { TransactionType } from '../types.js';
import { parseAmount, cleanMerchant } from '../normalize.js';

const SENDERS = new Set(['ICICIB', 'ICICI', 'ICICIBK', 'IMOBILE', 'ICICIPU', 'ICICIN']);
const DLT = /^[A-Z]{2}-ICICIB/;

const AUTOPAY_MAP: Record<string, string> = {
  'google play': 'Google Play Store',
  netflix: 'Netflix',
  spotify: 'Spotify',
  'amazon prime': 'Amazon Prime',
  hotstar: 'Disney+ Hotstar',
  youtube: 'YouTube Premium',
  jiocinema: 'JioCinema',
  zee5: 'Zee5',
  swiggy: 'Swiggy',
  zomato: 'Zomato',
};

export class ICICIBankParser extends BankParser {
  getBankName() { return 'ICICI Bank'; }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return SENDERS.has(u) || DLT.test(u);
  }

  protected extractAmount(body: string): number | null {
    const patterns: RegExp[] = [
      /([A-Z]{3})\s*([\d,]+(?:\.\d{1,2})?)\s*spent/i,
      /(?:Rs\.?|₹|INR)\s*([\d,]+(?:\.\d{1,2})?)\s*spent/i,
      /debited\s+with\s+(?:Rs\.?|₹|INR)\s*([\d,]+(?:\.\d{1,2})?)/i,
      /debited\s+for\s+(?:Rs\.?|₹|INR)\s*([\d,]+(?:\.\d{1,2})?)/i,
      /credited\s+with\s+(?:Rs\.?|₹|INR)\s*([\d,]+(?:\.\d{1,2})?)/i,
      /credited:\s*(?:Rs\.?|₹|INR)\s*([\d,]+(?:\.\d{1,2})?)/i,
    ];
    for (const p of patterns) {
      const m = body.match(p);
      if (m) {
        const raw = m[2] ?? m[1];
        if (raw) {
          const amount = parseAmount(raw);
          if (amount !== null) return amount;
        }
      }
    }
    return super.extractAmount(body);
  }

  protected extractTransactionType(body: string): TransactionType | null {
    const lower = body.toLowerCase();

    if (lower.includes('info by cash') || lower.includes('cash deposit')) return 'INCOME';

    if (
      (lower.includes('icici bank credit card') || (lower.includes('icici bank card') && lower.includes('spent'))) &&
      (lower.includes('spent') || lower.includes('debited'))
    ) {
      return 'EXPENSE';
    }

    return super.extractTransactionType(body);
  }

  protected extractMerchant(body: string, sender: string): string | null {
    const lower = body.toLowerCase();

    if (lower.includes('info by cash')) return 'Cash Deposit';

    if (lower.includes('autopay')) {
      for (const [key, name] of Object.entries(AUTOPAY_MAP)) {
        if (lower.includes(key)) return name;
      }
      return 'AutoPay';
    }

    // "to NAME. UPI" or "from NAME. UPI"
    const toM = body.match(/\bto\s+([A-Za-z0-9][^.\n@]{2,40}?)\.\s*UPI/);
    if (toM?.[1]) return cleanMerchant(toM[1]);

    const fromM = body.match(/\bfrom\s+([A-Za-z0-9][^.\n@]{2,40}?)\.\s*UPI/);
    if (fromM?.[1]) return cleanMerchant(fromM[1]);

    // "; NAME credited. UPI"
    const creditM = body.match(/;\s*([A-Za-z0-9][^.\n]{2,40}?)\s+credited\.\s*UPI/);
    if (creditM?.[1]) return cleanMerchant(creditM[1]);

    // NEFT/IMPS/RTGS
    const neftM = body.match(/(?:NEFT|IMPS|RTGS).*?(?:from|by|to)\s+([A-Za-z0-9][^.\n]{2,40}?)(?:\s+Ref|\.|$)/i);
    if (neftM?.[1]) return cleanMerchant(neftM[1]);

    return super.extractMerchant(body, sender);
  }

  protected extractBalance(body: string): number | null {
    const patterns = [
      /Available\s+Balance\s+is\s+(?:Rs\.?|₹|INR)\s*([\d,]+(?:\.\d{1,2})?)/i,
      /Avl\s+Bal\s+(?:Rs\.?|₹|INR)\s*([\d,]+(?:\.\d{1,2})?)/i,
      /Updated\s+Bal[:\s]+(?:Rs\.?|₹|INR)\s*([\d,]+(?:\.\d{1,2})?)/i,
    ];
    for (const p of patterns) {
      const m = body.match(p);
      if (m?.[1]) {
        const bal = parseAmount(m[1]);
        if (bal !== null) return bal;
      }
    }
    return super.extractBalance(body);
  }
}
