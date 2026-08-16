// Exact 1:1 port of SliceParser.kt from Cashiro parser-core
import { BankParser } from "../base-parser.js";
import type { TransactionType } from "../types.js";

export class SliceParser extends BankParser {
  getBankName(): string {
    return "Slice";
  }

  canHandle(sender: string): boolean {
    const normalizedSender = sender.toUpperCase();
    return (
      normalizedSender.includes("SLICE") ||
      normalizedSender.includes("SLICEIT") ||
      normalizedSender.includes("SLCEIT") // Matches JD-SLCEIT-S and similar
    );
  }

  protected override isTransactionMessage(message: string): boolean {
    const lowerMessage = message.toLowerCase();

    // Slice uses "sent" for UPI transfers
    if (lowerMessage.includes("sent")) {
      return true;
    }

    return super.isTransactionMessage(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    const lowerMessage = message.toLowerCase();

    // Look for "sent to NAME" pattern for UPI transfers
    const sentToPattern = /sent.*to\s+([A-Z][A-Z\s]+?)\s*\(/i;
    const sentToMatch = sentToPattern.exec(message);
    if (sentToMatch) {
      const merchant = (sentToMatch[1] ?? "").trim();
      if (merchant.length > 0) {
        return this.cleanMerchantName(merchant);
      }
    }

    // Look for "from MERCHANT" pattern
    const fromPattern = /from\s+([A-Z][A-Z0-9\s]+?)(?:\s+on|\s+\(|$)/i;
    const fromMatch = fromPattern.exec(message);
    if (fromMatch) {
      const merchant = (fromMatch[1] ?? "").trim();
      if (merchant.length > 0 && !merchant.match(/^NEFT$/i)) {
        return this.cleanMerchantName(merchant);
      }
    }

    // Check for specific patterns
    if (lowerMessage.includes("paypal")) {
      return "PayPal";
    }
    if (lowerMessage.includes("slice") && lowerMessage.includes("credited")) {
      return "Slice Credit";
    }

    return super.extractMerchant(message, sender) ?? "Slice";
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lowerMessage = message.toLowerCase();

    // Slice credits/cashbacks
    if (lowerMessage.includes("credited")) return "INCOME";
    if (lowerMessage.includes("received")) return "INCOME";
    if (lowerMessage.includes("cashback")) return "INCOME";
    if (lowerMessage.includes("refund")) return "INCOME";

    // Slice payments/debits
    if (lowerMessage.includes("debited")) return "CREDIT";
    if (lowerMessage.includes("spent")) return "CREDIT";
    if (lowerMessage.includes("paid")) return "CREDIT";
    if (lowerMessage.includes("sent")) return "CREDIT"; // UPI transfers
    if (lowerMessage.includes("payment") && !lowerMessage.includes("received")) return "CREDIT";

    return super.extractTransactionType(message);
  }
}
