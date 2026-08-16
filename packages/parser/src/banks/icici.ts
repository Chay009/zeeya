// Exact 1:1 port of ICICIBankParser.kt from Cashiro parser-core
import { BankParser } from "../base-parser.js";
import type { ParsedTransaction, TransactionType } from "../types.js";

export class ICICIBankParser extends BankParser {
  getBankName(): string {
    return "ICICI Bank";
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      u.includes("ICICI") ||
      u.includes("ICICIB") ||
      /^[A-Z]{2}-ICICIB-S$/.test(u) ||
      /^[A-Z]{2}-ICICI-S$/.test(u) ||
      /^[A-Z]{2}-ICICIB-[TPG]$/.test(u) ||
      /^[A-Z]{2}-ICICIB$/.test(u) ||
      /^[A-Z]{2}-ICICI$/.test(u) ||
      u === "ICICIB" ||
      u === "ICICIBANK"
    );
  }

  override parse(smsBody: string, sender: string, timestamp: number): ParsedTransaction | null {
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
    const MONTH_ABBRS = new Set([
      "JAN",
      "FEB",
      "MAR",
      "APR",
      "MAY",
      "JUN",
      "JUL",
      "AUG",
      "SEP",
      "OCT",
      "NOV",
      "DEC",
    ]);
    const m = /([A-Z]{3})\s+[0-9,]+(?:\.\d{2})?\s+spent/i.exec(message);
    if (m) {
      const currency = (m[1] ?? "").toUpperCase();
      if (currency.length === 3 && !MONTH_ABBRS.has(currency)) return currency;
    }
    return null;
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();

    if (lower.includes("will be debited")) return false;
    if (lower.includes("has been received on your icici bank credit card")) return false;
    if (lower.includes("cash deposit transaction") && lower.includes("has been completed"))
      return false;
    if (lower.includes("is due by")) return false;
    if (lower.includes("is due") || lower.includes("minimum amount due")) return false;
    if (lower.includes("your icici bank credit card") && lower.includes("statement")) return false;

    const iciciKeywords = [
      "debited with",
      "debited for",
      "credited with",
      "credited:",
      "autopay",
      "your account has been",
      "inr",
      "spent using",
    ];
    if (iciciKeywords.some((kw) => lower.includes(kw))) return true;

    return super.isTransactionMessage(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();

    // Credit card spend: "ICICI Bank Credit Card" or "ICICI Bank Card" + "spent"
    if (
      (lower.includes("icici bank credit card") ||
        (lower.includes("icici bank card") && lower.includes("spent"))) &&
      (lower.includes("spent") || lower.includes("debited"))
    ) {
      return "CREDIT";
    }

    if (lower.includes("info by cash")) return "INCOME";

    return super.extractTransactionType(message);
  }

  protected override extractAmount(message: string): number | null {
    // Multi-currency: "USD 11.80 spent"
    const multiCurrencyMatch = /[A-Z]{3}\s+([0-9,]+(?:\.\d{2})?)\s+spent/i.exec(message);
    if (multiCurrencyMatch?.[1]) {
      const val = parseFloat((multiCurrencyMatch[1] ?? "").replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    // "Rs. xxx spent"
    const inrSpentMatch = /(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)\s+spent/i.exec(message);
    if (inrSpentMatch?.[1]) {
      const val = parseFloat((inrSpentMatch[1] ?? "").replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    // "debited with Rs xxx"
    const debitWithMatch = /debited\s+with\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (debitWithMatch?.[1]) {
      const val = parseFloat((debitWithMatch[1] ?? "").replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    // "debited for Rs xxx"
    const debitForMatch = /debited\s+for\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (debitForMatch?.[1]) {
      const val = parseFloat((debitForMatch[1] ?? "").replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    // "credited with Rs xxx"
    const creditWithMatch = /credited\s+with\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (creditWithMatch?.[1]) {
      const val = parseFloat((creditWithMatch[1] ?? "").replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    // "credited:Rs. xxx" (cash deposit format)
    const creditColonMatch = /credited:\s*Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (creditColonMatch?.[1]) {
      const val = parseFloat((creditColonMatch[1] ?? "").replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    return super.extractAmount(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    // Salary: "Info INF*...*...* SAL"
    if (/Info\s+INF\*[^*]+\*[^*]*SAL[^.]*/i.test(message)) return "Salary";

    // Card transaction: "on DD-Mon-YY at/on MERCHANT. Avl|$"
    const cardMerchantMatch = /on\s+\d{1,2}-\w{3}-\d{2}\s+(?:at|on)\s+([^.]+?)(?:\.|Avl|$)/i.exec(
      message,
    );
    if (cardMerchantMatch?.[1]) {
      const m = this.cleanMerchantName((cardMerchantMatch[1] ?? "").trim());
      if (this.isValidMerchantName(m)) return m;
    }

    // ACH/NACH dividend: "Info ACH*COMPANY*" or "Info NACH*COMPANY*"
    const achNachMatch = /Info\s+(?:ACH|NACH)\*([^*]+)\*/i.exec(message);
    if (achNachMatch?.[1]) {
      const companyName = this.cleanMerchantName((achNachMatch[1] ?? "").trim());
      return `${companyName} Dividend`;
    }

    // Towards pattern: "towards MERCHANT for"
    const towardsMatch = /towards\s+([^.\n]+?)\s+for/i.exec(message);
    if (towardsMatch?.[1]) {
      const m = this.cleanMerchantName((towardsMatch[1] ?? "").trim());
      if (this.isValidMerchantName(m)) return m;
    }

    // From UPI: "from MERCHANT. UPI"
    const fromUpiMatch = /from\s+([^.\n]+?)\.\s*UPI/i.exec(message);
    if (fromUpiMatch?.[1]) {
      const m = this.cleanMerchantName((fromUpiMatch[1] ?? "").trim());
      if (this.isValidMerchantName(m)) return m;
    }

    // Credited pattern: "; MERCHANT credited. UPI"
    const creditedMatch = /;\s*([^.\n]+?)\s+credited\.\s*UPI/i.exec(message);
    if (creditedMatch?.[1]) {
      const m = this.cleanMerchantName((creditedMatch[1] ?? "").trim());
      if (this.isValidMerchantName(m)) return m;
    }

    // Cash deposit
    if (/Info\s+BY\s+CASH/i.test(message)) return "Cash Deposit";

    // AutoPay — detect known service names
    if (/autopay/i.test(message)) {
      const lower = message.toLowerCase();
      if (lower.includes("google play")) return "Google Play Store";
      if (lower.includes("netflix")) return "Netflix";
      if (lower.includes("spotify")) return "Spotify";
      if (lower.includes("amazon prime")) return "Amazon Prime";
      if (lower.includes("disney") || lower.includes("hotstar")) return "Disney+ Hotstar";
      if (lower.includes("youtube")) return "YouTube Premium";
      return "AutoPay Subscription";
    }

    return super.extractMerchant(message, sender);
  }

  protected override extractAccountLast4(message: string): string | null {
    // "ICICI Bank Card XX7004"
    const cardMatch = /ICICI\s+Bank\s+Card\s+[X*]*(\d+)/i.exec(message);
    if (cardMatch?.[1]) {
      const d = cardMatch[1];
      return d.length >= 4 ? d.slice(-4) : d;
    }

    // "ICICI Bank Account XX566"
    const accountMatch = /ICICI\s+Bank\s+Account\s+[X*]*(\d+)/i.exec(message);
    if (accountMatch?.[1]) {
      const d = (accountMatch[1] ?? "").replace(/\D/g, "");
      return d.length >= 4 ? d.slice(-4) : d;
    }

    // "Acct XX123"
    const acctMatch = /Acct\s+[X*]*(\d+)/i.exec(message);
    if (acctMatch?.[1]) {
      const d = (acctMatch[1] ?? "").replace(/\D/g, "");
      return d.length >= 4 ? d.slice(-4) : d;
    }

    // "ICICI Bank Acct XX..."
    const bankAcctMatch = /ICICI\s+Bank\s+Acct\s+[X*]*(\d+)/i.exec(message);
    if (bankAcctMatch?.[1]) {
      const d = (bankAcctMatch[1] ?? "").replace(/\D/g, "");
      return d.length >= 4 ? d.slice(-4) : d;
    }

    return super.extractAccountLast4(message);
  }

  protected override extractBalance(message: string): number | null {
    // "Available Balance is Rs. xxx" (ICICI-specific "is")
    const availBalIsMatch = /Available\s+Balance\s+is\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i.exec(
      message,
    );
    if (availBalIsMatch?.[1]) {
      const val = parseFloat((availBalIsMatch[1] ?? "").replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    // "Avl Bal Rs xxx"
    const avlBalMatch = /Avl\s+Bal\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (avlBalMatch?.[1]) {
      const val = parseFloat((avlBalMatch[1] ?? "").replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    // "Updated Bal: Rs xxx"
    const updatedBalMatch = /Updated\s+Bal[:\s]+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (updatedBalMatch?.[1]) {
      const val = parseFloat((updatedBalMatch[1] ?? "").replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    return super.extractBalance(message);
  }

  protected override extractReference(message: string): string | null {
    const rrnMatch = /RRN\s+([A-Za-z0-9]+)/i.exec(message);
    if (rrnMatch?.[1]) return rrnMatch[1];

    const upiMatch = /UPI:([A-Za-z0-9]+)/i.exec(message);
    if (upiMatch?.[1]) return upiMatch[1];

    const txnRefMatch = /transaction\s+reference\s+no\.?([A-Z0-9]+)/i.exec(message);
    if (txnRefMatch?.[1]) return txnRefMatch[1];

    return super.extractReference(message);
  }

  protected override extractAvailableLimit(message: string): number | null {
    const m = /Avl\s+Limit:\s*INR\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (m?.[1]) {
      const val = parseFloat((m[1] ?? "").replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }
    return super.extractAvailableLimit(message);
  }
}
