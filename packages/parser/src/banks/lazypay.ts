// Exact 1:1 port of LazyPayParser.kt from Cashiro parser-core
import { BankParser } from "../base-parser.js";
import type { TransactionType } from "../types.js";

/**
 * Parser for LazyPay wallet transactions.
 * Handles messages from BP-LZYPAY-S, JM-LZYPAY-S, JD-LZYPAY-S and similar senders.
 * LazyPay is a Buy Now Pay Later (BNPL) wallet service similar to Amazon Pay/Juspay.
 * All transactions are treated as CREDIT type since they're wallet-based credit transactions.
 */
export class LazyPayParser extends BankParser {
  getBankName(): string {
    return "LazyPay";
  }

  canHandle(sender: string): boolean {
    const normalizedSender = sender.toUpperCase();
    return normalizedSender.includes("LZYPAY") || normalizedSender.includes("LAZYPAY");
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    // Pattern 1: "for txn TXN512924131 on [MERCHANT] was successful"
    const onMerchantMatch = /on\s+([^.]+?)\s+was\s+successful/i.exec(message);
    if (onMerchantMatch?.[1]) {
      const rawMerchant = onMerchantMatch[1].trim();
      // Clean up common merchant names
      let cleanedMerchant: string;
      if (/Zepto Marketplace/i.test(rawMerchant)) {
        cleanedMerchant = "Zepto";
      } else if (/Innovative Retail Concepts/i.test(rawMerchant)) {
        cleanedMerchant = "BigBasket";
      } else if (/Swiggy/i.test(rawMerchant)) {
        cleanedMerchant = "Swiggy";
      } else if (/Zomato/i.test(rawMerchant)) {
        cleanedMerchant = "Zomato";
      } else {
        // Remove common suffixes like "Private Limited", "Pvt Ltd", etc.
        cleanedMerchant = rawMerchant
          .replace(/\s*(Private|Pvt\.?|Ltd\.?|Limited|Inc\.?|LLC|LLP).*$/i, "")
          .replace(/\s*\d+$/, "")
          .trim();
      }
      if (cleanedMerchant.length > 0) return cleanedMerchant;
    }

    // Pattern 2: Repayment messages
    if (/against your LazyPay statement/i.test(message)) {
      return "LazyPay Repayment";
    }

    // Default to LazyPay if no specific merchant found
    return super.extractMerchant(message, sender) ?? "LazyPay";
  }

  protected override extractAmount(message: string): number | null {
    // Pattern: "Rs. 235.76" or "Rs 235.76"
    const amountMatch = /Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (amountMatch?.[1]) {
      const amountStr = (amountMatch[1] ?? "").replace(/,/g, "");
      const val = parseFloat(amountStr);
      if (!isNaN(val)) return val;
    }
    return super.extractAmount(message);
  }

  protected override extractReference(message: string): string | null {
    // Extract transaction ID like "TXN512924131"
    const txnMatch = /txn\s+([A-Z0-9]+)/i.exec(message);
    if (txnMatch?.[1]) return txnMatch[1].trim();
    return super.extractReference(message);
  }

  protected override extractTransactionType(_message: string): TransactionType | null {
    // LazyPay is a credit service - all transactions are credit-based
    // Similar to how JuspayParser handles Amazon Pay
    return "CREDIT";
  }

  protected override isTransactionMessage(message: string): boolean {
    const lowerMessage = message.toLowerCase();

    // Skip failed payment messages
    if (
      lowerMessage.includes("could not be processed") ||
      lowerMessage.includes("due to a failure") ||
      lowerMessage.includes("payment failed") ||
      lowerMessage.includes("transaction failed") ||
      lowerMessage.includes("unsuccessful")
    ) {
      return false;
    }

    // Skip promotional messages
    if (
      lowerMessage.includes("offer") ||
      lowerMessage.includes("get cashback") ||
      lowerMessage.includes("explore more")
    ) {
      // But allow if it's a payment confirmation
      if (!lowerMessage.includes("payment of") && !lowerMessage.includes("was successful")) {
        return false;
      }
    }

    // Transaction indicators for LazyPay
    const transactionKeywords = [
      "payment of",
      "was successful",
      "against your lazypay statement",
      "thanks for your payment",
    ];

    return transactionKeywords.some((kw) => lowerMessage.includes(kw));
  }
}
