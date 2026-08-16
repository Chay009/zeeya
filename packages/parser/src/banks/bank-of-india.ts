// Exact 1:1 port of BankOfIndiaParser.kt from Cashiro parser-core
import { BankParser } from "../base-parser.js";
import type { TransactionType } from "../types.js";

function parseNum(str: string): number | null {
  const n = parseFloat(str.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export class BankOfIndiaParser extends BankParser {
  getBankName(): string {
    return "Bank of India";
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();

    // Direct sender IDs
    if (u === "BOIIND" || u === "BOIBNK") return true;

    // DLT patterns
    return (
      /^[A-Z]{2}-BOIIND-[ST]$/.test(u) ||
      /^[A-Z]{2}-BOIBNK-[ST]$/.test(u) ||
      /^[A-Z]{2}-BOI-[ST]$/.test(u) ||
      /^[A-Z]{2}-BOIIND$/.test(u) ||
      /^[A-Z]{2}-BOIBNK$/.test(u) ||
      /^[A-Z]{2}-BOI$/.test(u) ||
      /^BK-BOIIND.*$/.test(u) ||
      /^JD-BOIIND.*$/.test(u)
    );
  }

  protected override extractAmount(message: string): number | null {
    // Pattern 1: Rs.200.00 debited/credited
    const p1 = /Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s+(?:debited|credited)/i.exec(message);
    if (p1?.[1]) {
      const val = parseNum(p1[1]);
      if (val !== null) return val;
    }

    // Pattern 2: INR format
    const p2 = /INR\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s+(?:debited|credited)/i.exec(message);
    if (p2?.[1]) {
      const val = parseNum(p2[1]);
      if (val !== null) return val;
    }

    // Pattern 3: withdrawn Rs 500
    const p3 = /withdrawn\s+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i.exec(message);
    if (p3?.[1]) {
      const val = parseNum(p3[1]);
      if (val !== null) return val;
    }

    return super.extractAmount(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();

    // BOI specific: Cash deposits should be INCOME
    if (
      lower.includes("deposited in your account") ||
      (lower.includes("cash") && lower.includes("deposited"))
    ) {
      return "INCOME";
    }

    // Check for investment transactions
    if (this.isInvestmentTransaction(lower)) {
      return "INVESTMENT";
    }

    // UPI Mandate for mutual funds/investments
    if (
      lower.includes("mandate") &&
      (lower.includes("mutual fund") ||
        lower.includes("iccl") ||
        lower.includes("groww") ||
        lower.includes("zerodha") ||
        lower.includes("kuvera") ||
        lower.includes("paytm money"))
    ) {
      return "INVESTMENT";
    }

    // BOI specific: "debited A/c... and credited to" pattern indicates expense
    if (lower.includes("debited") && lower.includes("and credited to")) {
      return "EXPENSE";
    }

    // BOI specific: "credited A/c... and debited from" pattern indicates income
    if (lower.includes("credited") && lower.includes("and debited from")) {
      return "INCOME";
    }

    return super.extractTransactionType(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    // Pattern for cash deposit via Cash Acceptor Machine
    if (
      /Cash Acceptor Machine/i.test(message) ||
      (/cash/i.test(message) && /deposited/i.test(message))
    ) {
      return "Cash Deposit";
    }

    // Pattern for UPI Mandate execution: "towards MERCHANT for Mandate Created via PLATFORM"
    if (/Mandate/i.test(message) && /towards/i.test(message)) {
      // Try to extract platform first (e.g., "via GROWW")
      const viaMatch = /via\s+([A-Za-z0-9]+)/i.exec(message);
      if (viaMatch?.[1]) {
        const platform = this.cleanMerchantName(viaMatch[1].trim());
        if (this.isValidMerchantName(platform)) return platform;
      }

      // Extract merchant from "towards MERCHANT for"
      const towardsMatch = /towards\s+([^,\n]+?)(?:\s+for|\s*,|$)/i.exec(message);
      if (towardsMatch?.[1]) {
        const merchantInfo = towardsMatch[1].trim();
        const cleanedMerchant = merchantInfo.replace(/\s*-\s*Autopa.*$/i, "").trim();
        if (this.isValidMerchantName(cleanedMerchant)) {
          return this.cleanMerchantName(cleanedMerchant);
        }
      }
    }

    // Pattern 1: "credited to MERCHANT via UPI" (for debits)
    const creditedToMatch = /credited\s+to\s+([^.\n]+?)(?:\s+via|\s+Ref|\s+on|$)/i.exec(message);
    if (creditedToMatch?.[1]) {
      const merchant = this.cleanMerchantName(creditedToMatch[1].trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    // Pattern 2: "debited from MERCHANT via UPI" (for credits)
    const debitedFromMatch = /debited\s+from\s+([^.\n]+?)(?:\s+via|\s+Ref|\s+on|$)/i.exec(message);
    if (debitedFromMatch?.[1]) {
      const merchant = this.cleanMerchantName(debitedFromMatch[1].trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    // Pattern 3: ATM withdrawal
    if (/ATM/i.test(message) || /withdrawn/i.test(message)) {
      const atmMatch = /(?:ATM|withdrawn)\s+(?:at\s+)?([^.\n]+?)(?:\s+on|\s+Ref|$)/i.exec(message);
      if (atmMatch?.[1]) {
        const location = this.cleanMerchantName(atmMatch[1].trim());
        if (this.isValidMerchantName(location)) return `ATM - ${location}`;
      }
      return "ATM";
    }

    // Pattern 4: "towards MERCHANT" (generic, not for Mandate messages)
    if (!/Mandate/i.test(message)) {
      const towardsMatch = /towards\s+([^.\n]+?)(?:\s+via|\s+Ref|\s+on|$)/i.exec(message);
      if (towardsMatch?.[1]) {
        const merchant = this.cleanMerchantName(towardsMatch[1].trim());
        if (this.isValidMerchantName(merchant)) return merchant;
      }
    }

    // Pattern 5: "to MERCHANT" (generic)
    const toMatch = /to\s+([^.\n]+?)(?:\s+via|\s+Ref|\s+on|$)/i.exec(message);
    if (toMatch?.[1]) {
      const merchant = this.cleanMerchantName(toMatch[1].trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    // Pattern 6: "from MERCHANT" (generic)
    const fromMatch = /from\s+([^.\n]+?)(?:\s+via|\s+Ref|\s+on|$)/i.exec(message);
    if (fromMatch?.[1]) {
      const merchant = this.cleanMerchantName(fromMatch[1].trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    return super.extractMerchant(message, sender);
  }

  protected override extractAccountLast4(message: string): string | null {
    // Pattern 1: A/cXX5468 or A/c XX5468 (BOI format)
    const p1 = /A\/c\s*(?:XX|X\*+)?(\d{4})/i.exec(message);
    if (p1?.[1]) return p1[1];

    // Pattern 2: Account ending 1234
    const p2 = /(?:Account|A\/c)\s+ending\s+(\d{4})/i.exec(message);
    if (p2?.[1]) return p2[1];

    // Pattern 3: A/c No. XX1234
    const p3 = /A\/c\s+No\.?\s*(?:XX|X\*+)?(\d{4})/i.exec(message);
    if (p3?.[1]) return p3[1];

    return super.extractAccountLast4(message);
  }

  protected override extractReference(message: string): string | null {
    // Pattern 1: Ref No 315439383341 (BOI format)
    const p1 = /Ref\s+No\.?\s*(\d+)/i.exec(message);
    if (p1?.[1]) return p1[1];

    // Pattern 2: Reference: 123456
    const p2 = /Reference[:\s]+(\w+)/i.exec(message);
    if (p2?.[1]) return p2[1];

    // Pattern 3: Txn ID/Txn#
    const p3 = /Txn\s*(?:ID|#)[:\s]*(\w+)/i.exec(message);
    if (p3?.[1]) return p3[1];

    // Pattern 4: UPI reference
    const p4 = /UPI[:\s]+(\d+)/i.exec(message);
    if (p4?.[1]) return p4[1];

    return super.extractReference(message);
  }

  protected override extractBalance(message: string): number | null {
    // Pattern 1: Bal: Rs 1000.00
    const p1 = /Bal[:\s]+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i.exec(message);
    if (p1?.[1]) {
      const val = parseNum(p1[1]);
      if (val !== null) return val;
    }

    // Pattern 2: Available Balance: Rs 1000.00
    const p2 = /Available\s+Balance[:\s]+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i.exec(message);
    if (p2?.[1]) {
      const val = parseNum(p2[1]);
      if (val !== null) return val;
    }

    // Pattern 3: Avl Bal Rs 1000.00
    const p3 = /Avl\s+Bal[:\s]+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i.exec(message);
    if (p3?.[1]) {
      const val = parseNum(p3[1]);
      if (val !== null) return val;
    }

    return super.extractBalance(message);
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();

    // Skip future debit notifications
    if (lower.includes("will be")) return false;

    // Detect transaction messages with security notices
    if (lower.includes("call") && lower.includes("if not done by you")) {
      if (
        lower.includes("debited") ||
        lower.includes("credited") ||
        lower.includes("withdrawn") ||
        lower.includes("transferred")
      ) {
        return true;
      }
    }

    // Skip OTP and verification messages
    if (
      lower.includes("otp") ||
      lower.includes("one time password") ||
      lower.includes("verification code")
    ) {
      return false;
    }

    // Skip promotional messages
    if (
      lower.includes("offer") ||
      lower.includes("discount") ||
      lower.includes("cashback offer") ||
      lower.includes("win ")
    ) {
      return false;
    }

    return super.isTransactionMessage(message);
  }
}
