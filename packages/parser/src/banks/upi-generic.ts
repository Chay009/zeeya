// Generic UPI/wallet parser (no direct Kotlin equivalent — catches payment app senders)
import { BankParser } from "../base-parser.js";

const SENDER_SUBSTRINGS = [
  "PAYTM",
  "GPAY",
  "PHONEPE",
  "PHONPE",
  "BHIMUPI",
  "BHIM",
  "AIRTLP",
  "JIOMNY",
  "AMAZONP",
  "CRED",
];
const UPI_DLT = /^[A-Z]{2}-(?:PAYTM|GPAY|PHONEPE|BHIM|JIOM)/;

export class GenericUPIParser extends BankParser {
  getBankName(): string {
    return "UPI";
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    if (UPI_DLT.test(u)) return true;
    return SENDER_SUBSTRINGS.some((s) => u.includes(s));
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    const paidM = /[Pp]aid\s+to\s+([A-Za-z0-9][^.\n@]{2,40}?)(?:\s+via|\s+using|\s+Ref|\.|$)/.exec(
      message,
    );
    if (paidM?.[1]) return this.cleanMerchantName(paidM[1]);

    const sentM = /[Ss]ent\s+to\s+([A-Za-z0-9][^.\n@]{2,40}?)(?:\s+via|\s+Ref|\.|$)/.exec(message);
    if (sentM?.[1]) return this.cleanMerchantName(sentM[1]);

    const recvM = /[Rr]eceived\s+from\s+([A-Za-z0-9][^.\n@]{2,40}?)(?:\s+via|\s+Ref|\.|$)/.exec(
      message,
    );
    if (recvM?.[1]) return this.cleanMerchantName(recvM[1]);

    return super.extractMerchant(message, sender);
  }
}
