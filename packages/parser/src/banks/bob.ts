// 1:1 port of BankOfBarodaParser.kt from Cashiro parser-core
import { BankParser } from "../base-parser.js";
import type { TransactionType } from "../types.js";

export class BankOfBarodaParser extends BankParser {
  getBankName(): string {
    return "Bank of Baroda";
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      u.includes("BARODA") ||
      u.includes("BOBSMS") ||
      u.includes("BOBTXN") ||
      u.includes("BOBCRD") ||
      /(^|[-_])BOB([-_]|$)/.test(u) ||
      /^[A-Z]{2}-BOBSMS-[A-Z]$/.test(u) ||
      /^[A-Z]{2}-BOBTXN-[A-Z]$/.test(u) ||
      /^[A-Z]{2}-BOB-[A-Z]$/.test(u) ||
      /^[A-Z]{2}-BOBCRD-[A-Z]$/.test(u) ||
      u === "BOB" ||
      u === "BANKOFBARODA"
    );
  }

  protected override extractAmount(message: string): number | null {
    // Pattern 0: ALERT: INR XXX.XX is spent (Credit card pattern)
    const m0 = /ALERT:\s*INR\s*([\d,]+(?:\.\d{2})?)\s+is\s+spent/i.exec(message);
    if (m0?.[1]) {
      const val = parseFloat(m0[1].replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    // Pattern 1: Rs.XX transferred from A/c
    const m1 = /Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+transferred\s+from/i.exec(message);
    if (m1?.[1]) {
      const val = parseFloat(m1[1].replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    // Pattern 2: Rs.80.00 Dr. from
    const m2 = /Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+Dr\.?\s+from/i.exec(message);
    if (m2?.[1]) {
      const val = parseFloat(m2[1].replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    // Pattern 3: credited with INR 70.00
    const m3 = /credited\s+with\s+INR\s+([\d,]+(?:\.\d{2})?)/i.exec(message);
    if (m3?.[1]) {
      const val = parseFloat(m3[1].replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    // Pattern 4: Rs.xxxxxx Credited to
    const m4 = /Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+Credited\s+to/i.exec(message);
    if (m4?.[1]) {
      const val = parseFloat(m4[1].replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    // Pattern 5: Cr. to redacted@ybl (UPI)
    const m5 = /Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+.*?Cr\.?\s+to/i.exec(message);
    if (m5?.[1]) {
      const val = parseFloat(m5[1].replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    // Pattern 6: Rs.xxxxx deposited in cash
    const m6 = /Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+deposited\s+in\s+cash/i.exec(message);
    if (m6?.[1]) {
      const val = parseFloat(m6[1].replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    return super.extractAmount(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    // Pattern 1: transferred from A/c to:Merchant Name
    const m1 = /transferred\s+from\s+A\/c\s+[^\s]+\s+to:\s*([^.]+?)(?:\.|$)/i.exec(message);
    if (m1?.[1]) {
      const raw = (m1[1].trim().split(/\s+Total\s+Bal/i)[0] ?? "").trim();
      if (raw && this.isValidMerchantName(raw)) return this.cleanMerchantName(raw);
    }

    // Pattern 2: Cr. to redacted@ybl (UPI VPA)
    const m2 = /Cr\.?\s+to\s+([^\s]+@[^\s.]+)/i.exec(message);
    if (m2?.[1]) {
      const vpa = m2[1];
      const name = vpa.split("@")[0] ?? "";
      return name === "redacted" ? "UPI Payment" : this.cleanMerchantName(name);
    }

    // Pattern 3: IMPS by Name of Person
    const m3 = /IMPS\/[\d]+\s+by\s+([^.]+?)(?:\s*\.|$)/i.exec(message);
    if (m3?.[1]) {
      const merchant = this.cleanMerchantName(m3[1].trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    // Pattern 4: UPI context
    const lower = message.toLowerCase();
    if (lower.includes("upi")) {
      if (lower.includes("credited")) return "UPI Credit";
      if (lower.includes("dr.")) return "UPI Payment";
    }

    // Pattern 5: IMPS without clear merchant
    if (lower.includes("imps")) return "IMPS Transfer";

    // Pattern 6: Cash deposit
    if (lower.includes("deposited in cash")) return "Cash Deposit";

    return super.extractMerchant(message, sender);
  }

  protected override extractAccountLast4(message: string): string | null {
    // Pattern 0: BOBCARD ending 1234 (Credit card format)
    const m0 = /BOBCARD\s+ending\s+(\d{4})/i.exec(message);
    if (m0?.[1]) return m0[1];

    // Pattern 1: A/C XXXXXX (6 digits shown)
    const m1 = /A\/C\s+X*(\d{6})/i.exec(message);
    if (m1?.[1]) return m1[1].slice(-4);

    // Pattern 2: A/c ...xxxx
    const m2 = /A\/c\s+\.+(\d{4})/i.exec(message);
    if (m2?.[1]) return m2[1];

    return super.extractAccountLast4(message);
  }

  protected override extractBalance(message: string): number | null {
    // Pattern 1: AvlBal:Rs.xxxxx
    const m1 = /AvlBal:\s*Rs\.?\s*([\d,]+(?:\.\d{2})?)/i.exec(message);
    if (m1?.[1]) {
      const val = parseFloat(m1[1].replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    // Pattern 2: Total Bal:Rs.xxxxxxx
    const m2 = /Total\s+Bal:\s*Rs\.?\s*([\d,]+(?:\.\d{2})?)/i.exec(message);
    if (m2?.[1]) {
      const val = parseFloat(m2[1].replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    // Pattern 3: Avlbl Amt:Rs.xxxxxxxx
    const m3 = /Avlbl\s+Amt:\s*Rs\.?\s*([\d,]+(?:\.\d{2})?)/i.exec(message);
    if (m3?.[1]) {
      const val = parseFloat(m3[1].replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    return super.extractBalance(message);
  }

  protected override extractReference(message: string): string | null {
    // Pattern 1: Ref:52211xxxxxx
    const m1 = /Ref:\s*(\d+)/i.exec(message);
    if (m1?.[1]) return m1[1];

    // Pattern 2: UPI Ref No 510xxxxxxxxxx
    const m2 = /UPI\s+Ref\s+No\s+(\d+)/i.exec(message);
    if (m2?.[1]) return m2[1];

    // Pattern 3: IMPS/5182xxxxxxx
    const m3 = /IMPS\/(\d+)/i.exec(message);
    if (m3?.[1]) return m3[1];

    return super.extractReference(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();

    // Credit card transactions – BOBCARD
    if (lower.includes("spent on your bobcard")) return "CREDIT";
    if (lower.includes("bobcard") && lower.includes("spent")) return "CREDIT";
    if (lower.includes("bobcard") && lower.includes("is spent")) return "CREDIT";

    // Debit/Expense patterns
    if (lower.includes("transferred from")) return "EXPENSE";
    if (lower.includes("dr.") || lower.includes("debited")) return "EXPENSE";

    // Credit/Income patterns
    if (lower.includes("cr.") || lower.includes("credited")) return "INCOME";
    if (lower.includes("deposited")) return "INCOME";

    return super.extractTransactionType(message);
  }

  protected override extractAvailableLimit(message: string): number | null {
    const m = /Available\s+credit\s+limit\s+is\s+Rs\.?\s*([\d,]+(?:\.\d{2})?)/i.exec(message);
    if (m?.[1]) {
      const val = parseFloat(m[1].replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }
    return super.extractAvailableLimit(message);
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();

    if (
      lower.includes("dr. from") ||
      lower.includes("cr. to") ||
      lower.includes("credited to a/c") ||
      lower.includes("credited with inr") ||
      lower.includes("deposited in cash") ||
      lower.includes("transferred from") ||
      lower.includes("is spent")
    ) {
      return true;
    }

    return super.isTransactionMessage(message);
  }
}
