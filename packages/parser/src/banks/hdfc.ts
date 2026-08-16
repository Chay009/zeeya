import { BankParser } from "../base-parser.js";
import { CompiledPatterns } from "../patterns.js";
import type { BalanceUpdateInfo, MandateInfo, TransactionType } from "../types.js";

export interface EMandateInfo extends MandateInfo {
  amount: number;
  nextDeductionDate: string | null;
  merchant: string;
  umn: string | null;
  dateFormat: string;
}

export class HDFCBankParser extends BankParser {
  getBankName(): string {
    return "HDFC Bank";
  }

  canHandle(sender: string): boolean {
    const upperSender = sender.toUpperCase();
    if (["HDFCBK", "HDFCBANK", "HDFC", "HDFCB"].includes(upperSender)) return true;
    return CompiledPatterns.HDFC.DLT_PATTERNS.some((p) => p.test(upperSender));
  }

  isEMandateNotification(message: string): boolean {
    return /E-Mandate!/i.test(message);
  }

  isFutureDebitNotification(message: string): boolean {
    return message.toLowerCase().includes("will be");
  }

  parseEMandateSubscription(message: string): EMandateInfo | null {
    if (!this.isEMandateNotification(message)) return null;
    const amountMatch = CompiledPatterns.HDFC.AMOUNT_WILL_DEDUCT.exec(message);
    if (!amountMatch) return null;
    const amount = parseFloat((amountMatch[1] ?? "").replace(/,/g, ""));
    if (!isFinite(amount)) return null;
    const dateStr = CompiledPatterns.HDFC.DEDUCTION_DATE.exec(message)?.[1] ?? null;
    const merchantRaw = CompiledPatterns.HDFC.MANDATE_MERCHANT.exec(message)?.[1]?.trim() ?? null;
    const merchant = merchantRaw ? this.cleanMerchantName(merchantRaw) : "Unknown Subscription";
    const umn = CompiledPatterns.HDFC.UMN_PATTERN.exec(message)?.[1] ?? null;
    return { amount, nextDeductionDate: dateStr, merchant, umn, dateFormat: "dd/MM/yy" };
  }

  parseFutureDebit(message: string): EMandateInfo | null {
    if (!this.isFutureDebitNotification(message)) return null;
    const amountMatch = CompiledPatterns.HDFC.AMOUNT_WILL_DEDUCT.exec(message);
    if (!amountMatch) return null;
    const amount = parseFloat((amountMatch[1] ?? "").replace(/,/g, ""));
    if (!isFinite(amount)) return null;
    const dateStr = CompiledPatterns.HDFC.DEDUCTION_DATE.exec(message)?.[1] ?? null;
    const merchantRaw = CompiledPatterns.HDFC.MANDATE_MERCHANT.exec(message)?.[1]?.trim() ?? null;
    const merchant = merchantRaw ? this.cleanMerchantName(merchantRaw) : "Unknown Subscription";
    const umn = CompiledPatterns.HDFC.UMN_PATTERN.exec(message)?.[1] ?? null;
    return { amount, nextDeductionDate: dateStr, merchant, umn, dateFormat: "dd/MM/yy" };
  }

  isBalanceUpdateNotification(message: string): boolean {
    const lower = message.toLowerCase();
    const hasBalanceCue =
      lower.includes("avl bal") ||
      lower.includes("available bal") ||
      lower.includes("account balance") ||
      lower.includes("a/c balance") ||
      lower.includes("updated balance");
    const hasTxnVerb =
      lower.includes("debited") ||
      lower.includes("credited") ||
      lower.includes("withdrawn") ||
      lower.includes("spent") ||
      lower.includes("transferred") ||
      lower.includes("payment of");
    return hasBalanceCue && !hasTxnVerb;
  }

  parseBalanceUpdate(message: string): BalanceUpdateInfo | null {
    if (!this.isBalanceUpdateNotification(message)) return null;
    const accountLast4 = this.extractAccountLast4(message);
    if (!accountLast4) return null;
    const balance = this.extractBalance(message);
    if (balance === null) return null;
    return {
      bankName: this.getBankName(),
      accountLast4,
      balance,
      asOfDate: null,
      isCreditCard: false,
    };
  }

  protected isTransactionMessage(message: string): boolean {
    if (this.isEMandateNotification(message)) return false;
    if (this.isFutureDebitNotification(message)) return false;
    const lower = message.toLowerCase();
    if (lower.includes("bill alert") || (lower.includes("bill") && lower.includes("is due on")))
      return false;
    if (lower.includes("payment alert") && !lower.includes("will be")) return true;
    if (
      lower.includes("has requested") ||
      lower.includes("payment request") ||
      lower.includes("to pay, download") ||
      lower.includes("collect request") ||
      lower.includes("ignore if already paid")
    )
      return false;
    if (lower.includes("received towards your credit card")) return false;
    if (lower.includes("payment") && lower.includes("credited to your card")) return false;
    if (
      lower.includes("otp") ||
      lower.includes("one time password") ||
      lower.includes("verification code") ||
      lower.includes("offer") ||
      lower.includes("discount") ||
      lower.includes("cashback offer") ||
      lower.includes("win ")
    )
      return false;
    const keywords = [
      "debited",
      "credited",
      "withdrawn",
      "deposited",
      "spent",
      "received",
      "transferred",
      "paid",
      "sent",
      "deducted",
      "txn",
    ];
    return keywords.some((kw) => lower.includes(kw));
  }

  protected extractAmount(message: string): number | null {
    const patterns = [
      /(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)\s+(?:has been )?(?:debited|credited|spent)/i,
      /(?:debited|credited|spent)\s+(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i,
      /(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i,
    ];
    for (const pattern of patterns) {
      const match = pattern.exec(message);
      if (match) {
        const val = parseFloat((match[1] ?? "").replace(/,/g, ""));
        if (!isNaN(val)) return val;
        return null;
      }
    }
    return super.extractAmount(message);
  }

  protected extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();
    if (this.isInvestmentTransaction(lower)) return "INVESTMENT";
    if (lower.includes("block cc") || lower.includes("block pcc")) return "CREDIT";
    if (lower.includes("spent on card") && !lower.includes("block dc")) return "CREDIT";
    if (lower.includes("payment") && lower.includes("credit card")) return "EXPENSE";
    if (lower.includes("towards") && lower.includes("credit card")) return "EXPENSE";
    if (lower.includes("sent") && lower.includes("from hdfc")) return "EXPENSE";
    if (lower.includes("spent") && lower.includes("from hdfc bank card")) return "EXPENSE";
    if (lower.includes("debited")) return "EXPENSE";
    if (lower.includes("withdrawn") && !lower.includes("block cc")) return "EXPENSE";
    if (lower.includes("spent") && !lower.includes("card")) return "EXPENSE";
    if (lower.includes("charged")) return "EXPENSE";
    if (lower.includes("paid")) return "EXPENSE";
    if (lower.includes("purchase")) return "EXPENSE";
    if (lower.includes("credited")) return "INCOME";
    if (lower.includes("deposited")) return "INCOME";
    if (lower.includes("received")) return "INCOME";
    if (lower.includes("refund")) return "INCOME";
    if (lower.includes("cashback") && !lower.includes("earn cashback")) return "INCOME";
    return null;
  }

  protected extractMerchant(message: string, sender: string): string | null {
    // "From HDFC Bank Card ... At <merchant> On ..."
    if (/From HDFC Bank Card/i.test(message) && / At /i.test(message) && / On /i.test(message)) {
      const atIndex = message.search(/ At /i);
      const onIndex = message.search(/ On /i);
      if (atIndex !== -1 && onIndex !== -1 && onIndex > atIndex) {
        const merchant = message.substring(atIndex + 4, onIndex).trim();
        if (merchant.length > 0) return this.cleanMerchantName(merchant);
      }
    }

    // ATM withdrawal with location
    if (/withdrawn/i.test(message)) {
      const atLocationMatch = /At\s+\+?([^O]+?)\s+On/i.exec(message);
      if (atLocationMatch?.[1]) {
        const location = atLocationMatch[1].trim();
        return location.length > 0 ? `ATM at ${this.cleanMerchantName(location)}` : "ATM";
      }
      return "ATM";
    }

    if (/ATM/i.test(message)) return "ATM";

    // Block CC/PCC — credit card swipe at merchant
    if (
      /card/i.test(message) &&
      / at /i.test(message) &&
      (/block cc/i.test(message) || /block pcc/i.test(message))
    ) {
      const atMatch = /at\s+([^@\s]+(?:@[^\s]+)?(?:\s+[^\s]+)?)(?:\s+by\s+|\s+on\s+|$)/i.exec(
        message,
      );
      if (atMatch?.[1]) {
        const raw = atMatch[1].trim();
        let cleaned: string;
        if (raw.includes("@")) {
          const vpaName = raw.split("@")[0]?.trim() ?? "";
          cleaned = /qr$/i.test(vpaName) ? vpaName.slice(0, -2) : vpaName;
        } else {
          cleaned = raw;
        }
        if (cleaned.length > 0) return this.cleanMerchantName(cleaned);
      }
    }

    // Salary credit
    if (/SALARY/i.test(message) && /deposited/i.test(message)) {
      const salaryMatch = CompiledPatterns.HDFC.SALARY_PATTERN.exec(message);
      if (salaryMatch?.[1]) return this.cleanMerchantName(salaryMatch[1].trim());
      const simpleSalaryMatch = CompiledPatterns.HDFC.SIMPLE_SALARY_PATTERN.exec(message);
      if (simpleSalaryMatch?.[1]) {
        const m = simpleSalaryMatch[1].trim();
        if (m.length > 0 && !/^\d+$/.test(m)) return this.cleanMerchantName(m);
      }
    }

    // Info: field
    if (/Info:/i.test(message)) {
      const infoMatch = CompiledPatterns.HDFC.INFO_PATTERN.exec(message);
      if (infoMatch?.[1]) {
        const m = infoMatch[1].trim();
        if (m.length > 0 && !/^UPI$/i.test(m)) return this.cleanMerchantName(m);
      }
    }

    // VPA-based merchant extraction
    if (/VPA/i.test(message)) {
      if (/from VPA/i.test(message) && /credited/i.test(message)) {
        const fromVpaMatch = CompiledPatterns.HDFC.FROM_VPA_CREDIT.exec(message);
        if (fromVpaMatch?.[1]) {
          const vpaUsername = fromVpaMatch[1].trim();
          if (vpaUsername.length > 0) return this.cleanMerchantName(vpaUsername);
        }
      }
      const vpaWithNameMatch = CompiledPatterns.HDFC.VPA_WITH_NAME.exec(message);
      if (vpaWithNameMatch?.[1]) return this.cleanMerchantName(vpaWithNameMatch[1].trim());
      const vpaMatch = CompiledPatterns.HDFC.VPA_PATTERN.exec(message);
      if (vpaMatch?.[1]) {
        const vpaName = vpaMatch[1].trim();
        if (vpaName.length > 3 && !/^\d+$/.test(vpaName)) return this.cleanMerchantName(vpaName);
      }
    }

    // "spent on Card" → SPENT_PATTERN
    if (/spent on Card/i.test(message)) {
      const spentMatch = CompiledPatterns.HDFC.SPENT_PATTERN.exec(message);
      if (spentMatch?.[1]) return this.cleanMerchantName(spentMatch[1].trim());
    }

    // "debited for"
    if (/debited for/i.test(message)) {
      const debitForMatch = CompiledPatterns.HDFC.DEBIT_FOR_PATTERN.exec(message);
      if (debitForMatch?.[1]) return this.cleanMerchantName(debitForMatch[1].trim());
    }

    // UPI Mandate
    if (/UPI Mandate/i.test(message)) {
      const mandateMatch = CompiledPatterns.HDFC.MANDATE_PATTERN.exec(message);
      if (mandateMatch?.[1]) return this.cleanMerchantName(mandateMatch[1].trim());
    }

    // "Sent Rs" + "From HDFC Bank"
    if (/Sent Rs/i.test(message) && /From HDFC Bank/i.test(message)) {
      const sentToMatch = /\bTo\s+(.+?)\s+On\s+\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/i.exec(message);
      if (sentToMatch?.[1]) {
        const payee = sentToMatch[1].trim();
        let merchant: string;
        if (payee.includes("@")) {
          const vpaName = payee.split("@")[0]?.trim() ?? "";
          merchant = /[a-zA-Z]/.test(vpaName) ? this.cleanMerchantName(vpaName) : "UPI Payee";
        } else {
          merchant = this.cleanMerchantName(payee);
        }
        if (this.isValidMerchantName(merchant)) return merchant;
      }
    }

    // "towards"
    if (/towards/i.test(message)) {
      const towardsMatch = /towards\s+([^\n]+?)(?:\s+UMRN|\s+ID:|\s+Alert:|$)/i.exec(message);
      if (towardsMatch?.[1]) {
        const m = towardsMatch[1].trim();
        if (m.length > 0) return this.cleanMerchantName(m);
      }
    }

    // "For:"
    if (/For:/i.test(message)) {
      const forColonMatch = /For:\s+([^\n]+?)(?:\s+From|\s+Via|$)/i.exec(message);
      if (forColonMatch?.[1]) {
        const m = forColonMatch[1].trim();
        if (m.length > 0) return this.cleanMerchantName(m);
      }
    }

    // "for ... will be debited"
    if (/for /i.test(message) && /will be debited/i.test(message)) {
      const forMatch = /for\s+([^\n]+?)(?:\s+ID:|\s+Act:|$)/i.exec(message);
      if (forMatch?.[1]) {
        const m = forMatch[1].trim();
        if (m.length > 0) return this.cleanMerchantName(m);
      }
    }

    return super.extractMerchant(message, sender);
  }

  protected extractReference(message: string): string | null {
    // Kotlin order: REF_SIMPLE, UPI_REF_NO, REF_NO, REF_END
    const refSimpleMatch = CompiledPatterns.HDFC.REF_SIMPLE.exec(message);
    if (refSimpleMatch?.[1]) return refSimpleMatch[1];
    const upiRefMatch = CompiledPatterns.HDFC.UPI_REF_NO.exec(message);
    if (upiRefMatch?.[1]) return upiRefMatch[1];
    const refNoMatch = CompiledPatterns.HDFC.REF_NO.exec(message);
    if (refNoMatch?.[1]) return refNoMatch[1];
    const refEndMatch = CompiledPatterns.HDFC.REF_END.exec(message);
    if (refEndMatch?.[1]) return refEndMatch[1];
    return super.extractReference(message);
  }

  protected extractAccountLast4(message: string): string | null {
    // Card x(\d{4})
    const cardMatch = CompiledPatterns.HDFC.CARD_LAST4.exec(message);
    if (cardMatch?.[1]) return cardMatch[1];

    // BLOCK DC (\d{4})
    const blockDcMatch = CompiledPatterns.HDFC.BLOCK_DC.exec(message);
    if (blockDcMatch?.[1]) return blockDcMatch[1];

    // HDFC Bank ([X*]*\d+) → filter digits → takeLast(4)
    const hdfcBankMatch = CompiledPatterns.HDFC.HDFC_BANK_ACCOUNT.exec(message);
    if (hdfcBankMatch?.[1]) {
      const digits = hdfcBankMatch[1].replace(/\D/g, "");
      if (digits.length >= 4) return digits.slice(-4);
      if (digits.length > 0) return digits;
    }

    // Account patterns: ACCOUNT_DEPOSITED, ACCOUNT_FROM, ACCOUNT_SIMPLE, ACCOUNT_GENERIC
    for (const pattern of [
      CompiledPatterns.HDFC.ACCOUNT_DEPOSITED,
      CompiledPatterns.HDFC.ACCOUNT_FROM,
      CompiledPatterns.HDFC.ACCOUNT_SIMPLE,
      CompiledPatterns.HDFC.ACCOUNT_GENERIC,
    ]) {
      const m = pattern.exec(message);
      if (m?.[1]) {
        const digits = m[1].replace(/\D/g, "");
        return digits.length >= 4 ? digits.slice(-4) : digits;
      }
    }

    return super.extractAccountLast4(message);
  }

  protected extractBalance(message: string): number | null {
    // Avl bal:? INR
    const avlBalMatch = CompiledPatterns.HDFC.AVL_BAL_INR.exec(message);
    if (avlBalMatch?.[1]) {
      const val = parseFloat(avlBalMatch[1].replace(/,/g, ""));
      if (isFinite(val)) return val;
    }
    // Available Balance:? INR
    const availBalMatch = CompiledPatterns.HDFC.AVAILABLE_BAL_INR.exec(message);
    if (availBalMatch?.[1]) {
      const val = parseFloat(availBalMatch[1].replace(/,/g, ""));
      if (isFinite(val)) return val;
    }
    // Bal Rs.?
    const balRsMatch = CompiledPatterns.HDFC.BAL_RS.exec(message);
    if (balRsMatch?.[1]) {
      const val = parseFloat(balRsMatch[1].replace(/,/g, ""));
      if (isFinite(val)) return val;
    }
    return super.extractBalance(message);
  }

  protected extractAvailableLimit(message: string): number | null {
    const patterns = [
      /Avl\s+Lmt:?\s*(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i,
      /Avl\s+Limit:?\s*(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i,
      /Available\s+(?:Credit\s+)?Limit:?\s*(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)/i,
    ];
    for (const pattern of patterns) {
      const match = pattern.exec(message);
      if (match?.[1]) {
        const val = parseFloat(match[1].replace(/,/g, ""));
        if (isFinite(val)) return val;
      }
    }
    return super.extractAvailableLimit(message);
  }
}
