// Exact 1:1 port of IDBIBankParser.kt from Cashiro parser-core
import { BankParser } from '../base-parser.js';

function parseNum(str: string): number | null {
  const n = parseFloat(str.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export class IDBIBankParser extends BankParser {
  getBankName(): string {
    return 'IDBI Bank';
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      u.includes('IDBIBK') ||
      u.includes('IDBIBANK') ||
      u.includes('IDBI') ||
      // DLT patterns for transactions (-S suffix)
      /^[A-Z]{2}-IDBIBK-S$/.test(u) ||
      /^[A-Z]{2}-IDBI-S$/.test(u) ||
      // Legacy patterns
      /^[A-Z]{2}-IDBIBK$/.test(u) ||
      /^[A-Z]{2}-IDBI$/.test(u) ||
      // Direct sender IDs
      u === 'IDBIBK' ||
      u === 'IDBIBANK'
    );
  }

  protected override extractAmount(message: string): number | null {
    // Pattern 1: "debited with Rs 59.00"
    const m1 = /debited\s+with\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (m1?.[1]) {
      const val = parseNum(m1[1]);
      if (val !== null) return val;
    }

    // Pattern 2: "debited for Rs 1040.00"
    const m2 = /debited\s+for\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (m2?.[1]) {
      const val = parseNum(m2[1]);
      if (val !== null) return val;
    }

    // Pattern 3: "credited with Rs XXX"
    const m3 = /credited\s+with\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (m3?.[1]) {
      const val = parseNum(m3[1]);
      if (val !== null) return val;
    }

    return super.extractAmount(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    // Pattern 1: "towards <merchant> for"
    const m1 = /towards\s+([^.\n]+?)\s+for/i.exec(message);
    if (m1?.[1]) {
      const merchant = this.cleanMerchantName(m1[1].trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    // Pattern 2: "; <merchant> credited."
    const m2 = /;\s*([^.\n]+?)\s+credited\./i.exec(message);
    if (m2?.[1]) {
      const merchant = this.cleanMerchantName(m2[1].trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    // Pattern 3: AutoPay/Mandate specific
    if (/autopay|mandate/i.test(message)) {
      const m3 = /towards\s+([^.\n]+?)\s+for\s+\w*MANDATE/i.exec(message);
      if (m3?.[1]) {
        return this.cleanMerchantName(m3[1].trim());
      }
    }

    return super.extractMerchant(message, sender);
  }

  protected override extractAccountLast4(message: string): string | null {
    // Pattern 1: "Acct XX1234"
    const m1 = /Acct\s+(?:XX|X\*+)?(\d{3,4})/i.exec(message);
    if (m1?.[1]) return m1[1];

    // Pattern 2: "IDBI Bank Acct XX1234"
    const m2 = /IDBI\s+Bank\s+Acct\s+(?:XX|X\*+)?(\d{3,4})/i.exec(message);
    if (m2?.[1]) return m2[1];

    return super.extractAccountLast4(message);
  }

  protected override extractReference(message: string): string | null {
    // Pattern 1: "RRN 519766155631"
    const m1 = /RRN\s+([A-Za-z0-9]+)/i.exec(message);
    if (m1?.[1]) return m1[1];

    // Pattern 2: "UPI:521687538121"
    const m2 = /UPI:([A-Za-z0-9]+)/i.exec(message);
    if (m2?.[1]) return m2[1];

    return super.extractReference(message);
  }

  protected override extractBalance(message: string): number | null {
    // Pattern: "Bal Rs 3694.38"
    const m = /Bal\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (m?.[1]) {
      const val = parseNum(m[1]);
      if (val !== null) return val;
    }

    return super.extractBalance(message);
  }

  protected override isTransactionMessage(message: string): boolean {
    // Skip UPI block instructions (not a transaction)
    // The check in the Kotlin source deliberately does NOT skip the message here;
    // it just notes that block-UPI instruction text isn't a transaction blocker.
    // Delegate to base class for all standard checks.
    return super.isTransactionMessage(message);
  }
}
