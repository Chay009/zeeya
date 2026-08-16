// 1:1 port of EquitasBankParser.kt from Cashiro parser-core
import { BankParser } from "../base-parser.js";
import type { TransactionType } from "../types.js";

export class EquitasBankParser extends BankParser {
  getBankName(): string {
    return "Equitas Small Finance Bank";
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return u.includes("EQUTAS") || u.includes("EQUITA") || u.includes("EQUITS");
  }

  protected override extractAmount(message: string): number | null {
    // "INR X debited" or "INR X credited"
    const m = /INR\s+([0-9,]+(?:\.\d{2})?)\s+(?:debited|credited)/i.exec(message);
    if (m?.[1]) {
      const val = parseFloat(m[1].replace(/,/g, ""));
      if (isFinite(val)) return val;
    }
    return super.extractAmount(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();
    if (lower.includes("debited")) return "EXPENSE";
    if (lower.includes("credited")) return "INCOME";
    if (lower.includes("withdrawn")) return "EXPENSE";
    if (lower.includes("deposited")) return "INCOME";
    return super.extractTransactionType(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    const lower = message.toLowerCase();

    if (lower.includes("debited")) {
      const m = /on\s+\d{2}-\d{2}-\d{2}\s+to\s+([^.]+?)(?:\.\s*Avl|\.\s*Not|\.Not|\.$)/i.exec(
        message,
      );
      if (m?.[1]) {
        const merchant = this.cleanMerchantName(m[1].trim());
        if (this.isValidMerchantName(merchant)) return merchant;
      }
    }

    if (lower.includes("credited")) {
      const m = /on\s+\d{2}-\d{2}-\d{2}\s+from\s+([^.]+?)(?:\.\s*Avl|\.\s*Not|\.Not|\.$)/i.exec(
        message,
      );
      if (m?.[1]) {
        const merchant = this.cleanMerchantName(m[1].trim());
        if (this.isValidMerchantName(merchant)) return merchant;
      }
    }

    if (/via\s+UPI/i.test(message)) return "UPI Transaction";

    return super.extractMerchant(message, sender);
  }

  protected override extractAccountLast4(message: string): string | null {
    const base = super.extractAccountLast4(message);
    if (base) return base;

    const m = /(?:Equitas\s+)?A\/c\s+([X\d]+)/i.exec(message);
    if (m?.[1]) {
      const d = m[1];
      return d.length >= 4 ? d.slice(-4) : d;
    }
    return null;
  }

  protected override extractBalance(message: string): number | null {
    // "Avl Bal is INR X"
    const m = /Avl\s+Bal\s+is\s+INR\s+([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (m?.[1]) {
      const val = parseFloat(m[1].replace(/,/g, ""));
      if (isFinite(val)) return val;
    }
    return super.extractBalance(message);
  }

  protected override extractReference(message: string): string | null {
    const m = /-?Ref[:\s]*([A-Z0-9]+)/i.exec(message);
    if (m?.[1]) return m[1];
    return super.extractReference(message);
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();

    if (
      lower.includes("otp") ||
      lower.includes("one time password") ||
      lower.includes("verification code")
    ) {
      return false;
    }

    if (lower.includes("offer") || lower.includes("discount") || lower.includes("cashback offer")) {
      return false;
    }

    const keywords = [
      "debited",
      "credited",
      "withdrawn",
      "deposited",
      "transferred",
      "received",
      "paid",
    ];
    return keywords.some((k) => lower.includes(k));
  }
}
