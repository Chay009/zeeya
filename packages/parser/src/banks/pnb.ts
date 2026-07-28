import { BankParser } from '../base-parser.js';
import { cleanMerchant } from '../normalize.js';

const SENDERS = new Set(['PNBSMS', 'PNB', 'PNBMOB', 'PNBALRT']);
const DLT = /^[A-Z]{2}-PNB/;

export class PNBBankParser extends BankParser {
  getBankName() { return 'Punjab National Bank'; }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return SENDERS.has(u) || DLT.test(u);
  }

  protected extractMerchant(body: string, sender: string): string | null {
    // NEFT/IMPS transfer
    const neftM = body.match(/(?:NEFT|IMPS|RTGS)[^:]*(?:from|to|by)\s+([A-Za-z0-9][^.\n]{2,40}?)(?:\s+Ref|\.|$)/i);
    if (neftM?.[1]) return cleanMerchant(neftM[1]);

    if (/\bATM\b/.test(body)) return 'ATM Withdrawal';

    return super.extractMerchant(body, sender);
  }
}
