// Exact 1:1 port of IDBIBankParser.kt from Cashiro parser-core
import { BankParser } from "../base-parser.js";

function parseNum(str: string): number | null {
  const n = parseFloat(str.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export class IDBIBankParser extends BankParser {
  getBankName(): string {
    return "IDBI Bank";
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      u.includes("IDBIBK") ||
      u.includes("IDBIBANK") ||
      u.includes("IDBI") ||
      /^[A-Z]{2}-IDBIBK-S$/.test(u) ||
      /^[A-Z]{2}-IDBI-S$/.test(u) ||
      /^[A-Z]{2}-IDBIBK$/.test(u) ||
      /^[A-Z]{2}-IDBI$/.test(u) ||
      u === "IDBIBK" ||
      u === "IDBIBANK"
    );
  }

  protected override extractAmount(message: string): number | null {
    // Pattern 1: "debited with Rs 59.00"
    const c1 = /debited\s+with\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i.exec(message)?.[1];
    if (c1) {
      const v = parseNum(c1);
      if (v !== null) return v;
    }

    // Pattern 2: "debited for Rs 1040.00"
    const c2 = /debited\s+for\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i.exec(message)?.[1];
    if (c2) {
      const v = parseNum(c2);
      if (v !== null) return v;
    }

    // Pattern 3: "credited with Rs XXX"
    const c3 = /credited\s+with\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i.exec(message)?.[1];
    if (c3) {
      const v = parseNum(c3);
      if (v !== null) return v;
    }

    return super.extractAmount(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    // Pattern 1: "towards <merchant> for"
    const c1 = /towards\s+([^.\n]+?)\s+for/i.exec(message)?.[1];
    if (c1) {
      const merchant = this.cleanMerchantName(c1.trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    // Pattern 2: "; <merchant> credited."
    const c2 = /;\s*([^.\n]+?)\s+credited\./i.exec(message)?.[1];
    if (c2) {
      const merchant = this.cleanMerchantName(c2.trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    // Pattern 3: AutoPay/Mandate specific
    if (/autopay|mandate/i.test(message)) {
      const c3 = /towards\s+([^.\n]+?)\s+for\s+\w*MANDATE/i.exec(message)?.[1];
      if (c3) return this.cleanMerchantName(c3.trim());
    }

    return super.extractMerchant(message, sender);
  }

  protected override extractAccountLast4(message: string): string | null {
    // Pattern 1: "Acct XX1234"
    const c1 = /Acct\s+(?:XX|X\*+)?(\d{3,4})/i.exec(message)?.[1];
    if (c1) return c1;

    // Pattern 2: "IDBI Bank Acct XX1234"
    const c2 = /IDBI\s+Bank\s+Acct\s+(?:XX|X\*+)?(\d{3,4})/i.exec(message)?.[1];
    if (c2) return c2;

    return super.extractAccountLast4(message);
  }

  protected override extractReference(message: string): string | null {
    // Pattern 1: "RRN 519766155631"
    const c1 = /RRN\s+([A-Za-z0-9]+)/i.exec(message)?.[1];
    if (c1) return c1;

    // Pattern 2: "UPI:521687538121"
    const c2 = /UPI:([A-Za-z0-9]+)/i.exec(message)?.[1];
    if (c2) return c2;

    return super.extractReference(message);
  }

  protected override extractBalance(message: string): number | null {
    // Pattern: "Bal Rs 3694.38"
    const c = /Bal\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i.exec(message)?.[1];
    if (c) {
      const v = parseNum(c);
      if (v !== null) return v;
    }

    return super.extractBalance(message);
  }

  protected override isTransactionMessage(message: string): boolean {
    // Kotlin comment: checking "to block upi" + "send sms" intentionally does NOT skip the
    // message — it's instruction text embedded in a valid transaction SMS.
    return super.isTransactionMessage(message);
  }
}
