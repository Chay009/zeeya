import { BankParser } from "../base-parser.js";
import type { ParsedTransaction, TransactionType } from "../types.js";

export class IDFCFirstBankParser extends BankParser {
  getBankName(): string {
    return "IDFC First Bank";
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return u.includes("IDFCBK") || u.includes("IDFCFB") || u.includes("IDFC");
  }

  parse(smsBody: string, sender: string, timestamp: number): ParsedTransaction | null {
    if (!this.isTransactionMessage(smsBody)) return null;
    const amount = this.extractAmount(smsBody);
    if (amount === null) return null;
    const type = this.extractTransactionType(smsBody);
    if (type === null) return null;
    const currency = this.extractCurrencyFromMessage(smsBody) ?? "INR";
    const availableLimit = type === "CREDIT" ? this.extractAvailableLimit(smsBody) : null;
    return {
      amount,
      type,
      merchant: this.extractMerchant(smsBody, sender),
      reference: this.extractReference(smsBody),
      accountLast4: this.extractAccountLast4(smsBody),
      balance: this.extractBalance(smsBody),
      creditLimit: availableLimit,
      smsBody,
      sender,
      timestamp,
      bankName: this.getBankName(),
      transactionHash: null,
      isFromCard: this.detectIsCard(smsBody),
      currency,
      fromAccount: null,
      toAccount: null,
    };
  }

  private extractCurrencyFromMessage(message: string): string | null {
    const m = /([A-Z]{3})\s+[0-9,]+(?:\.\d{2})?\s+spent/i.exec(message);
    if (m) {
      const currency = m[1]!.toUpperCase();
      if (!/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/.test(currency)) {
        return currency;
      }
    }
    return null;
  }

  protected extractAmount(message: string): number | null {
    const patterns = [
      /[A-Z]{3}\s+([0-9,]+(?:\.\d{2})?)\s+spent/i,
      /Debit\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
      /debited\s+by\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
      /debited\s+by\s+INR\s*([0-9,]+(?:\.\d{2})?)/i,
      /credited\s+by\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
      /credited\s+with\s+INR\s*([0-9,]+(?:\.\d{2})?)/i,
      /credited\s+by\s+INR\s*([0-9,]+(?:\.\d{2})?)/i,
      /interest\s+of\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
    ];
    for (const pattern of patterns) {
      const m = pattern.exec(message);
      if (m) {
        const val = parseFloat(m[1]!.replace(/,/g, ""));
        if (!isNaN(val)) return val;
      }
    }
    return super.extractAmount(message);
  }

  protected isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();
    if (
      lower.includes("otp") ||
      lower.includes("one time password") ||
      lower.includes("verification code")
    )
      return false;
    if (
      lower.includes("offer") ||
      lower.includes("discount") ||
      lower.includes("cashback offer") ||
      lower.includes("win ")
    )
      return false;
    if (
      lower.includes("has requested") ||
      lower.includes("payment request") ||
      lower.includes("collect request") ||
      lower.includes("requesting payment") ||
      lower.includes("requests rs") ||
      lower.includes("ignore if already paid")
    )
      return false;
    const transactionKeywords = [
      "debit",
      "debited",
      "credited",
      "withdrawn",
      "deposited",
      "spent",
      "received",
      "transferred",
      "paid",
      "interest",
    ];
    return transactionKeywords.some((kw) => lower.includes(kw));
  }

  protected extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();
    if (lower.includes("debit")) return "EXPENSE";
    if (lower.includes("debited")) return "EXPENSE";
    if (lower.includes("spent")) return "EXPENSE";
    if (lower.includes("credited")) return "INCOME";
    if (lower.includes("withdrawn") || lower.includes("withdrawal")) return "EXPENSE";
    if (lower.includes("deposited") || lower.includes("deposit")) return "INCOME";
    if (lower.includes("cash deposit")) return "INCOME";
    if (lower.includes("interest") && lower.includes("earned")) return "INCOME";
    if (lower.includes("monthly interest")) return "INCOME";
    return super.extractTransactionType(message);
  }

  protected extractMerchant(message: string, sender: string): string | null {
    const lower = message.toLowerCase();

    if (lower.includes("monthly interest")) return "Interest Credit";

    if (lower.includes("cash deposit")) {
      const atmM = /ATM\s+(?:ID\s+)?([A-Z0-9]+)/i.exec(message);
      if (atmM) return `Cash Deposit - ATM ${atmM[1]!}`;
      return "Cash Deposit";
    }

    if (message.toUpperCase().includes("UPI")) {
      const upiM = /(?:to|from|at)\s+([a-zA-Z0-9._-]+@[a-zA-Z0-9]+)/i.exec(message);
      if (upiM) return `UPI - ${upiM[1]!}`;
      return "UPI Transaction";
    }

    if (message.toUpperCase().includes("IMPS")) {
      const mobileM = /mobile\s+[X]*(\d{3,4})/i.exec(message);
      if (mobileM) return `IMPS Transfer - Mobile XXX${mobileM[1]!}`;
      return "IMPS Transfer";
    }

    if (message.toUpperCase().includes("NEFT")) return "NEFT Transfer";
    if (message.toUpperCase().includes("RTGS")) return "RTGS Transfer";

    if (message.toUpperCase().includes("ATM")) {
      const atmIdM = /ATM\s+([A-Z]{2}\d+)/i.exec(message);
      if (atmIdM) return `ATM - ${atmIdM[1]!}`;
      return "ATM Transaction";
    }

    const toM = /(?:to|at|for)\s+([A-Z][A-Z0-9\s&.-]+?)(?:\s+on|\s+New|\.|,|$)/i.exec(message);
    if (toM) {
      const merchant = this.cleanMerchantName(toM[1]!);
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    return super.extractMerchant(message, sender);
  }

  protected extractAccountLast4(message: string): string | null {
    const cardEndingM = /Credit\s+Card\s+ending\s+[X]*(\d{4})/i.exec(message);
    if (cardEndingM) return cardEndingM[1]!;

    const acM = /A\/C\s+[X]*(\d{3,4})/i.exec(message);
    if (acM) {
      const digits = acM[1]!;
      return digits.length >= 4 ? digits.slice(-4) : digits;
    }

    return super.extractAccountLast4(message);
  }

  protected extractBalance(message: string): number | null {
    const patterns = [
      /New\s+Bal\s*:\s*(?:INR|Rs\.?)\s*([0-9,]+(?:\.\d{2})?)/i,
      /New\s+balance\s+is\s+INR\s*([0-9,]+(?:\.\d{2})?)/i,
      /Updated\s+balance\s+is\s+INR\s*([0-9,]+(?:\.\d{2})?)/i,
    ];
    for (const pattern of patterns) {
      const m = pattern.exec(message);
      if (m) {
        const val = parseFloat(m[1]!.replace(/,/g, ""));
        if (!isNaN(val)) return val;
      }
    }
    return super.extractBalance(message);
  }

  protected extractReference(message: string): string | null {
    const impsM = /IMPS\s+Ref\s+no\s+(\d+)/i.exec(message);
    if (impsM) return impsM[1]!;

    const upiM = /UPI[:/]\s*([0-9]+)/i.exec(message);
    if (upiM) return upiM[1]!;

    const txnM = /(?:txn|transaction)\s*(?:id|ref|no)[:\s]*([A-Z0-9]+)/i.exec(message);
    if (txnM) return txnM[1]!;

    return super.extractReference(message);
  }
}
