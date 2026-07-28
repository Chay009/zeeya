import { BankParser } from '../base-parser.js';
import { cleanMerchant } from '../normalize.js';

const SENDERS = new Set(['SBI', 'SBIINB', 'SBIUPI', 'SBICRD', 'ATMSBI', 'SBIBK', 'SBIBNK', 'CBSSBI', 'SBIMB', 'SBIPSG']);
const DLT = /^[A-Z]{2}-SBI/;

export class SBIBankParser extends BankParser {
  getBankName() { return 'State Bank of India'; }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return SENDERS.has(u) || DLT.test(u);
  }

  protected extractMerchant(body: string, sender: string): string | null {
    // UPI: "Ref No 12345 to NAME"
    const upiM = body.match(/UPI\s*[Rr]ef\s*[Nn]o?\s*\d+\s*to\s+([A-Za-z0-9][^.\n]{2,40}?)(?:\s*Ref|\s+on|\.|$)/);
    if (upiM?.[1]) return cleanMerchant(upiM[1]);

    // ATM
    if (/\bATM\b/.test(body)) {
      const atmM = body.match(/\bATM\b[^.]*?(?:at\s+)?([A-Za-z][^.\n]{2,40}?)(?:\s+on|\s+Avl|\.|$)/i);
      return atmM?.[1] ? cleanMerchant(`ATM ${atmM[1]}`) : 'ATM Withdrawal';
    }

    // NEFT/IMPS/RTGS
    const neftM = body.match(/(?:NEFT|IMPS|RTGS)[^:]*:\s*([A-Za-z0-9][^.\n]{2,40}?)(?:\s+Ref|\s+on|\.|$)/i);
    if (neftM?.[1]) return cleanMerchant(neftM[1]);

    // Merchant name after date: "DD-MM-YY - MERCHANT"
    const dateM = body.match(/\d{2}[-/]\d{2}[-/]\d{2,4}\s*[-–]\s*([A-Za-z][^.\n]{2,40}?)(?:\.|$)/);
    if (dateM?.[1]) return cleanMerchant(dateM[1]);

    return super.extractMerchant(body, sender);
  }
}
