// Exact 1:1 port of JuspayParser.kt from Cashiro parser-core
import { BankParser } from "../base-parser.js";
import type { TransactionType } from "../types.js";

export class JuspayParser extends BankParser {
  getBankName(): string {
    return "Amazon Pay";
  }

  override getCurrency(): string {
    return "INR";
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return u.includes("JUSPAY") || u.includes("APAY") || u === "AMAZON PAY";
  }

  protected override extractAmount(message: string): number | null {
    // Pattern 1: "Your Apay Wallet balance is debited for INR Xxx"
    const debitMatch = /debited\s+for\s+INR\s+([0-9,]+(?:\.[0-9]{1,2})?)/i.exec(message);
    if (debitMatch?.[1]) {
      const val = parseFloat(debitMatch[1].replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    // Pattern 2: "Payment of Rs xxx using Apay Balance"
    const paymentMatch = /Payment\s+of\s+Rs\s+([0-9,]+(?:\.[0-9]{1,2})?)/i.exec(message);
    if (paymentMatch?.[1]) {
      const val = parseFloat(paymentMatch[1].replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    // Pattern 3: "Rs xxx" generic pattern
    const rsMatch = /Rs\s+([0-9,]+(?:\.[0-9]{1,2})?)/i.exec(message);
    if (rsMatch?.[1]) {
      const val = parseFloat(rsMatch[1].replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    // Pattern 4: "INR xxx" generic pattern
    const inrMatch = /INR\s+([0-9,]+(?:\.[0-9]{1,2})?)/i.exec(message);
    if (inrMatch?.[1]) {
      const val = parseFloat(inrMatch[1].replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    return super.extractAmount(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    const lowerMessage = message.toLowerCase();

    // Pattern 1: "successful at merchant" - captures multi-word merchants
    // Captures everything between "successful at" and ". Updated" or end of sentence
    const merchantMatch =
      /successful\s+at\s+(.+?)(?:\.\s*Updated|\s*\.\s*Updated|\.(?:\s|$))/i.exec(message);
    if (merchantMatch?.[1]) {
      return merchantMatch[1].trim();
    }

    // Pattern 2: Common merchant indicators
    if (lowerMessage.includes("amazon")) return "Amazon";
    if (lowerMessage.includes("flipkart")) return "Flipkart";
    if (lowerMessage.includes("swiggy")) return "Swiggy";
    if (lowerMessage.includes("zomato")) return "Zomato";
    if (lowerMessage.includes("ola")) return "Ola";
    if (lowerMessage.includes("uber")) return "Uber";
    if (lowerMessage.includes("zepto")) return "Zepto";
    if (lowerMessage.includes("blinkit")) return "Blinkit";
    if (lowerMessage.includes("apay wallet")) return "Amazon Pay Transaction";
    if (lowerMessage.includes("wallet")) return "Amazon Pay Transaction";

    return super.extractMerchant(message, sender) ?? "Amazon Pay";
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes("debited")) return "EXPENSE";
    if (lowerMessage.includes("payment")) return "EXPENSE";
    if (lowerMessage.includes("charged")) return "EXPENSE";
    if (lowerMessage.includes("credited")) return "CREDIT";
    if (lowerMessage.includes("refunded")) return "CREDIT";
    if (lowerMessage.includes("received")) return "CREDIT";

    return null;
  }

  protected override extractReference(message: string): string | null {
    // Pattern 1: "Transaction Reference Number is 123456789012"
    const refMatch = /Transaction\s+Reference\s+Number\s+is\s+(\d{12})/i.exec(message);
    if (refMatch?.[1]) return refMatch[1];

    // Pattern 2: "Reference Number: 123456789012" or "Reference No: 123456789012"
    const altRefMatch = /Reference\s+(?:Number|No)[:\s]+(\d{12})/i.exec(message);
    if (altRefMatch?.[1]) return altRefMatch[1];

    return super.extractReference(message);
  }

  protected override isTransactionMessage(message: string): boolean {
    const lowerMessage = message.toLowerCase();

    const transactionKeywords = [
      "debited for",
      "payment of rs",
      "using apay balance",
      "transaction reference number",
      "updated balance is",
    ];

    return (
      transactionKeywords.some((kw) => lowerMessage.includes(kw)) ||
      super.isTransactionMessage(message)
    );
  }
}
