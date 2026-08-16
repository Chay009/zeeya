// 1:1 port of CredParser.kt from Cashiro parser-core
import { BankParser } from "../base-parser.js";
import type { TransactionType } from "../types.js";

export class CredParser extends BankParser {
  getBankName(): string {
    return "CRED";
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      /^[A-Z]{2}-CREDIN-S$/.test(u) ||
      /^[A-Z]{2}-CRED-[TPG]$/.test(u) ||
      /^[A-Z]{2}-CRED-S$/.test(u) ||
      u === "CRED" ||
      u === "CREDIN"
    );
  }

  protected override extractAmount(message: string): number | null {
    // "Rs.XX,XXX" or "Rs. XX,XXX"
    const m = /Rs\.?\s*([0-9,]+(?:\.\d{2})?)/.exec(message);
    if (m?.[1]) {
      const val = parseFloat(m[1].replace(/,/g, ""));
      if (isFinite(val)) return val;
    }
    return super.extractAmount(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    // "towards your ICICI Bank Credit Card" → "ICICI Bank Credit Card"
    const m = /towards\s+your\s+(.+?)\s+Credit\s+Card/i.exec(message);
    if (m?.[1]) {
      const cardName = m[1].trim();
      if (cardName.length > 0) return `${cardName} Credit Card`;
    }
    return super.extractMerchant(message, sender) ?? "CRED";
  }

  protected override extractTransactionType(_message: string): TransactionType | null {
    return "TRANSFER";
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();
    if (lower.includes("payment of") && lower.includes("credited towards your")) return true;
    return super.isTransactionMessage(message);
  }
}
