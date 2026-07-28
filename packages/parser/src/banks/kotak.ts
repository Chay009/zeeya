import { BankParser } from '../base-parser.js';
import { cleanMerchant } from '../normalize.js';

const SENDERS = new Set(['KOTAKB', 'KOTAK', 'KTKSMS', 'KMBANK', 'KOTAKBNK']);
const DLT = /^[A-Z]{2}-KOTAK/;

export class KotakBankParser extends BankParser {
  getBankName() { return 'Kotak Mahindra Bank'; }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return SENDERS.has(u) || DLT.test(u);
  }

  protected extractMerchant(body: string, sender: string): string | null {
    // UPI: "to VPA NAME"
    const upiM = body.match(/\bto\s+([A-Za-z0-9][^.\n@]{2,40}?)\s+via\s+(?:UPI|IMPS)/i);
    if (upiM?.[1]) return cleanMerchant(upiM[1]);

    // ATM
    if (/\bATM\b/.test(body)) return 'ATM Withdrawal';

    return super.extractMerchant(body, sender);
  }
}
