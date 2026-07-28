import { BankParser } from '../base-parser.js';
import type { TransactionType } from '../types.js';
import { parseAmount, cleanMerchant } from '../normalize.js';

const SENDERS = new Set(['AXISBK', 'AXIS', 'AXISB', 'AXISNF', 'AXISBFN', 'AXISBN']);
const DLT = /^[A-Z]{2}-AXIS/;

export class AxisBankParser extends BankParser {
  getBankName() { return 'Axis Bank'; }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return SENDERS.has(u) || DLT.test(u);
  }

  protected extractAmount(body: string): number | null {
    const patterns = [
      /INR\s*([\d,]+(?:\.\d{1,2})?)\s*debited/i,
      /INR\s*([\d,]+(?:\.\d{1,2})?)\s*credited/i,
      /Payment\s+of\s+INR\s*([\d,]+(?:\.\d{1,2})?)/i,
      /(?:Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
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

    // Credit card via available limit
    if (lower.includes('avl limit') || lower.includes('avl lmt')) return 'EXPENSE';

    if ((lower.includes('credit card') || lower.includes(' cc ')) && (lower.includes('debited') || lower.includes('spent'))) {
      return 'EXPENSE';
    }

    return super.extractTransactionType(body);
  }

  protected extractMerchant(body: string, sender: string): string | null {
    const lower = body.toLowerCase();

    // ATM
    if (lower.includes('atm') || (lower.includes('cash withdrawal') && lower.includes('debited'))) {
      return 'ATM Withdrawal';
    }

    // Card debit: "debited from A/c no. XXXX on MERCHANT DD-MM-YYYY"
    const cardM = body.match(/debited\s+from\s+[Aa][\/.]?[Cc]\s*(?:[Nn]o\.?)?\s*\S+\s+on\s+([^0-9\n]{3,40}?)\s*\d{2}[-/]\d{2}/);
    if (cardM?.[1]) return cleanMerchant(cardM[1]);

    // "Spent...IST\nMERCHANT"
    const istM = body.match(/IST\s*\n\s*([^\n]+?)(?:\s*\n|\s*Avl)/);
    if (istM?.[1]) return cleanMerchant(istM[1]);

    // UPI: "UPI/P2A/.../NAME"
    const upiM = body.match(/UPI\/(?:P2A\/)?[^/]+\/[^/]+\/([^\n]+?)(?:\s*Not you|$)/);
    if (upiM?.[1]) return cleanMerchant(upiM[1]);

    // Info pattern: "Info - MERCHANT"
    const infoM = body.match(/[Ii]nfo\s*[-–]\s*([^.\n]{2,40}?)(?:\.\s*[Cc]hk|$)/);
    if (infoM?.[1]) {
      const merchant = cleanMerchant(infoM[1]);
      return merchant.toUpperCase().includes('SALARY') ? 'Salary' : merchant;
    }

    return super.extractMerchant(body, sender);
  }
}
