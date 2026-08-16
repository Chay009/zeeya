import { BankParser } from "../base-parser.js";
import type { TransactionType } from "../types.js";

export class AxisBankParser extends BankParser {
  getBankName(): string {
    return "Axis Bank";
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      u.includes("AXIS BANK") ||
      u.includes("AXISBANK") ||
      u.includes("AXISBK") ||
      u.includes("AXISB") ||
      /^[A-Z]{2}-AXISBK-S$/.test(u) ||
      /^[A-Z]{2}-AXISBANK-S$/.test(u) ||
      /^[A-Z]{2}-AXIS-S$/.test(u) ||
      /^[A-Z]{2}-AXISBK$/.test(u) ||
      /^[A-Z]{2}-AXIS$/.test(u) ||
      u === "AXISBK" ||
      u === "AXISBANK" ||
      u === "AXIS"
    );
  }

  protected extractAmount(message: string): number | null {
    const inrDebitM = /INR\s+([0-9,]+(?:\.\d{2})?)\s+debited/i.exec(message);
    if (inrDebitM) {
      const val = parseFloat(inrDebitM[1]!.replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    const inrCreditM = /INR\s+([0-9,]+(?:\.\d{2})?)\s+credited/i.exec(message);
    if (inrCreditM) {
      const val = parseFloat(inrCreditM[1]!.replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    const paymentM = /Payment\s+of\s+INR\s+([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (paymentM) {
      const val = parseFloat(paymentM[1]!.replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    return super.extractAmount(message);
  }

  protected extractMerchant(message: string, sender: string): string | null {
    const lower = message.toLowerCase();

    if (lower.includes("debited from a/c no.") && lower.includes(" on axis bank")) {
      return "ATM";
    }

    if ((lower.includes("atm") || lower.includes("cash withdrawal")) && lower.includes("debited")) {
      return "ATM";
    }

    const debitCardM = /debited from A\/c no\. [^\s]+ on ([^0-9]+?)(?:\d{2}-\d{2}-\d{4})/i.exec(
      message,
    );
    if (debitCardM) {
      const merchant = this.cleanMerchantName(debitCardM[1]!.trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    const spentIstM =
      /Spent[\s\S]*?IST\s*\n\s*([^\n]+?)(?:\s*\n|\s*Avl Limit:|\s*Avl Lmt|\s*Not you?)/i.exec(
        message,
      );
    if (spentIstM) {
      let merchant = spentIstM[1]!.trim();
      merchant = merchant.replace(/\s+Limi$/, "");
      merchant = merchant.replace(/\s+Pay$/, "");
      merchant = merchant.replace(/\s+SUPE$/, "");
      merchant = this.cleanMerchantName(merchant);
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    const spentTimeM =
      /Spent[\s\S]*?\d{2}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s*\n\s*([^\n]+?)(?:\s*\n|\s*Avl Limit:|\s*Avl Lmt|\s*Not you?)/i.exec(
        message,
      );
    if (spentTimeM) {
      let merchant = spentTimeM[1]!.trim();
      merchant = merchant.replace(/\s+Limi$/, "");
      merchant = merchant.replace(/\s+Pay$/, "");
      merchant = merchant.replace(/\s+SUPE$/, "");
      merchant = this.cleanMerchantName(merchant);
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    const upiMerchantM = /UPI\/[^/]+\/[^/]+\/([^\n]+?)(?:\s*Not you|\s*$)/i.exec(message);
    if (upiMerchantM) {
      const merchant = this.cleanMerchantName(upiMerchantM[1]!.trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    const upiPersonM = /UPI\/P2A\/[^/]+\/([^\n]+?)(?:\s*Not you|\s*$)/i.exec(message);
    if (upiPersonM) {
      const merchant = this.cleanMerchantName(upiPersonM[1]!.trim());
      if (this.isValidMerchantName(merchant)) return merchant;
    }

    const infoM = /Info\s*[-–]\s*([^.\n]+?)(?:\.\s*Chk|\s*$)/i.exec(message);
    if (infoM) {
      const info = infoM[1]!.trim();
      if (info.toUpperCase().includes("SALARY")) return "Salary";
      return this.cleanMerchantName(info);
    }

    return super.extractMerchant(message, sender);
  }

  protected extractAccountLast4(message: string): string | null {
    const acNoM = /A\/c\s+no\.\s+([X*x]+[a-zA-Z\d]+)/i.exec(message);
    if (acNoM) {
      const accountStr = acNoM[1]!;
      const digitsAndLetters = accountStr.replace(/[^a-zA-Z0-9]/g, "");
      if ([...digitsAndLetters].some((c) => c >= "a" && c <= "z")) {
        return digitsAndLetters.length >= 4
          ? digitsAndLetters.slice(-4).toLowerCase()
          : digitsAndLetters.toLowerCase();
      }
      const digitsOnly = accountStr.replace(/\D/g, "");
      return digitsOnly.length >= 4 ? digitsOnly.slice(-4) : digitsOnly;
    }

    const cardNoM = /Card\s+no\.\s+([X*]*\d+)/i.exec(message);
    if (cardNoM) {
      const digitsOnly = cardNoM[1]!.replace(/\D/g, "");
      return digitsOnly.length >= 4 ? digitsOnly.slice(-4) : digitsOnly;
    }

    const creditCardM = /Credit\s+Card\s+([X*]*\d+)/i.exec(message);
    if (creditCardM) {
      const digitsOnly = creditCardM[1]!.replace(/\D/g, "");
      return digitsOnly.length >= 4 ? digitsOnly.slice(-4) : digitsOnly;
    }

    return super.extractAccountLast4(message);
  }

  protected extractReference(message: string): string | null {
    const upiRefM = /UPI\/[^/]+\/([0-9]+)/i.exec(message);
    if (upiRefM) return upiRefM[1]!;
    return super.extractReference(message);
  }

  protected isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();
    if (
      lower.includes("payment") &&
      lower.includes("has been received") &&
      lower.includes("towards your axis bank")
    ) {
      return false;
    }
    return super.isTransactionMessage(message);
  }

  protected extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();
    if (lower.includes("avl limit") || lower.includes("avl lmt")) return "CREDIT";
    if (
      (lower.includes("credit card") || lower.includes(" cc ")) &&
      (lower.includes("debited") || lower.includes("spent"))
    ) {
      return "CREDIT";
    }
    return super.extractTransactionType(message);
  }

  protected extractAvailableLimit(message: string): number | null {
    const patterns = [
      /Avl\s+Limit:?\s*INR\s+([0-9,]+(?:\.\d{2})?)/i,
      /Avl\s+Lmt\s+INR\s+([0-9,]+(?:\.\d{2})?)/i,
      /Available\s+limit:?\s*INR\s+([0-9,]+(?:\.\d{2})?)/i,
    ];
    for (const pattern of patterns) {
      const m = pattern.exec(message);
      if (m) {
        const val = parseFloat(m[1]!.replace(/,/g, ""));
        if (!isNaN(val)) return val;
      }
    }
    return super.extractAvailableLimit(message);
  }
}
