import { BankParser } from '../base-parser.js';
import type { TransactionType } from '../types.js';
import { parseAmount, cleanMerchant } from '../normalize.js';

const SENDERS = new Set(['HDFCBK', 'HDFCBANK', 'HDFC', 'HDFCB', 'HDFCBS', 'HDFCNB']);
const DLT = /^[A-Z]{2}-HDFC/;

export class HDFCBankParser extends BankParser {
  getBankName() { return 'HDFC Bank'; }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return SENDERS.has(u) || DLT.test(u);
  }

  protected extractAmount(body: string): number | null {
    const patterns = [
      /(?:Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:debited|credited|spent)/i,
      /(?:Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
      /INR\s*([\d,]+(?:\.\d{1,2})?)/i,
    ];
    for (const p of patterns) {
      const m = body.match(p);
      if (m?.[1]) {
        const amount = parseAmount(m[1]);
        if (amount !== null) return amount;
      }
    }
    return super.extractAmount(body);
  }

  protected extractTransactionType(body: string): TransactionType | null {
    const lower = body.toLowerCase();

    if (
      (lower.includes('hdfc bank credit card') || lower.includes('hdfc bank card')) &&
      (lower.includes('spent') || lower.includes('debited'))
    ) {
      return 'EXPENSE';
    }

    if (/sent\s+(?:Rs\.?|₹|INR)/i.test(body)) return 'EXPENSE';

    return super.extractTransactionType(body);
  }

  protected extractMerchant(body: string, sender: string): string | null {
    // ATM withdrawal
    if (/\bATM\b/i.test(body) && /withdrawn|withdrawal/i.test(body)) {
      const m = body.match(/\b[Aa]t\s+([A-Z0-9][^O\n]{2,40}?)\s+[Oo]n\s+\d/);
      return m?.[1] ? cleanMerchant(`ATM ${m[1]}`) : 'ATM Withdrawal';
    }

    // Card: "At MERCHANT On DD-MM-YYYY"
    const cardM = body.match(/\b[Aa]t\s+([A-Z][^\n]{2,40}?)\s+[Oo]n\s+\d{2}/);
    if (cardM?.[1]) return cleanMerchant(cardM[1]);

    // UPI: "Info:NAME@upi" or "Info: NAME"
    const infoM = body.match(/[Ii]nfo[:\s]+([A-Za-z0-9 .]{2,40}?)(?:\s*@|\s+UPI|\s+Ref|\s*$)/);
    if (infoM?.[1]) return cleanMerchant(infoM[1]);

    // "Spent at/on MERCHANT"
    const spentM = body.match(/[Ss]pent\s+(?:at|on)\s+([A-Za-z0-9][^.\n]{2,40}?)(?:\.|,|$)/);
    if (spentM?.[1]) return cleanMerchant(spentM[1]);

    // "For: MERCHANT"
    const forM = body.match(/[Ff]or:\s*([^.\n]{2,40}?)(?:\s+[Ff]rom|\s+[Vv]ia|$)/);
    if (forM?.[1]) return cleanMerchant(forM[1]);

    // Salary / NEFT
    const neftM = body.match(/(?:NEFT|IMPS|RTGS)[^:]*?(?:from|by)\s+([A-Za-z0-9][^.\n]{2,40}?)(?:\s+Ref|\.|$)/i);
    if (neftM?.[1]) return cleanMerchant(neftM[1]);

    return super.extractMerchant(body, sender);
  }
}
