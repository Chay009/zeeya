import { BankParser } from '../base-parser.js';
import { cleanMerchant } from '../normalize.js';

const SENDERS = new Set(['INDUSB', 'INDUS', 'INDUSLB', 'INDUSBNK', 'IBLBANK']);
const DLT = /^[A-Z]{2}-INDUS/;

export class IndusIndBankParser extends BankParser {
  getBankName() { return 'IndusInd Bank'; }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return SENDERS.has(u) || DLT.test(u);
  }

  protected extractMerchant(body: string, sender: string): string | null {
    // "towards MERCHANT"
    const towardsM = body.match(/\btowards\s+([A-Za-z0-9][^.\n]{2,40}?)(?:\s+(?:on|Ref|UPI)|\.|$)/i);
    if (towardsM?.[1]) return cleanMerchant(towardsM[1]);

    if (/\bATM\b/.test(body)) return 'ATM Withdrawal';

    return super.extractMerchant(body, sender);
  }
}
