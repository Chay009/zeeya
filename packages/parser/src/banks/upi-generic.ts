import { BankParser } from '../base-parser.js';
import { cleanMerchant } from '../normalize.js';

// Matches UPI app senders + payment wallets
const SENDER_SUBSTRINGS = ['PAYTM', 'GPAY', 'PHONEPE', 'PHONPE', 'BHIMUPI', 'BHIM', 'AIRTLP', 'JIOMNY', 'AMAZONP', 'CRED'];
const UPI_DLT = /^[A-Z]{2}-(?:PAYTM|GPAY|PHONEPE|BHIM|JIOM)/;

export class GenericUPIParser extends BankParser {
  getBankName() { return 'UPI'; }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    if (UPI_DLT.test(u)) return true;
    for (const sub of SENDER_SUBSTRINGS) {
      if (u.includes(sub)) return true;
    }
    return false;
  }

  protected extractMerchant(body: string, sender: string): string | null {
    // "paid to NAME"
    const paidM = body.match(/[Pp]aid\s+to\s+([A-Za-z0-9][^.\n@]{2,40}?)(?:\s+via|\s+using|\s+Ref|\.|$)/);
    if (paidM?.[1]) return cleanMerchant(paidM[1]);

    // "sent to NAME"
    const sentM = body.match(/[Ss]ent\s+to\s+([A-Za-z0-9][^.\n@]{2,40}?)(?:\s+via|\s+Ref|\.|$)/);
    if (sentM?.[1]) return cleanMerchant(sentM[1]);

    // "received from NAME"
    const recvM = body.match(/[Rr]eceived\s+from\s+([A-Za-z0-9][^.\n@]{2,40}?)(?:\s+via|\s+Ref|\.|$)/);
    if (recvM?.[1]) return cleanMerchant(recvM[1]);

    return super.extractMerchant(body, sender);
  }
}
