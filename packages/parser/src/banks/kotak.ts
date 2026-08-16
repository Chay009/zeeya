// Exact 1:1 port of KotakBankParser.kt from Cashiro parser-core
import { BankParser } from "../base-parser.js";
import type { TransactionType } from "../types.js";

export class KotakBankParser extends BankParser {
  getBankName(): string {
    return "Kotak Bank";
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return /^[A-Z]{2}-KOTAKB-[ST]$/.test(u) || u === "KOTAKB" || u === "KOTAK";
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    const toPattern = /to\s+([^\s]+@[^\s]+)\s+on/i;
    const fromPattern = /from\s+([^\s]+@[^\s]+)\s+on/i;

    const upiMatch = toPattern.exec(message) ?? fromPattern.exec(message);
    if (upiMatch) {
      const upiId = (upiMatch[1] ?? "").trim();
      const merchantName = this.extractMerchantFromUpiId(upiId);
      if (merchantName !== null) return merchantName;
    }

    return super.extractMerchant(message, sender);
  }

  private extractMerchantFromUpiId(upiId: string): string | null {
    if (upiId.startsWith("upi") || upiId.toLowerCase().startsWith("upi")) {
      const name = upiId.substring(3).split("@")[0];
      if (name && name.length > 0) return this.cleanMerchantName(name);
    }

    const namePart = upiId.split("@")[0];
    const bankCode = upiId.split("@")[1] ?? "";

    if (!namePart) return null;

    if (this.isPaymentAppGeneratedId(namePart)) {
      return this.extractMerchantFromBankCode(bankCode) ?? this.cleanMerchantName(namePart);
    }

    if (namePart.length > 0 && !/^\d+$/.test(namePart)) {
      if (/^[\d\-_]+$/.test(namePart)) {
        return this.extractMerchantFromBankCode(bankCode) ?? namePart;
      }
      return this.cleanMerchantName(namePart);
    }

    if (/^\d+$/.test(namePart)) return namePart;

    return null;
  }

  private isPaymentAppGeneratedId(name: string): boolean {
    const lower = name.toLowerCase();
    const generatedPrefixes = [
      "paytmqr",
      "phonepeqr",
      "phonepe.qr",
      "gpay",
      "amazonpayqr",
      "bhimqr",
      "bharatpeqr",
      "freechargeqr",
      "mobikwikqr",
    ];
    if (generatedPrefixes.some((p) => lower.startsWith(p))) return true;
    if (name.length > 20 && /[a-zA-Z]/.test(name) && /\d/.test(name)) return true;
    return false;
  }

  private extractMerchantFromBankCode(bankCode: string): string | null {
    const map: Record<string, string> = {
      okaxis: "Axis Bank",
      okbizaxis: "Axis Bank Business",
      okhdfcbank: "HDFC Bank",
      okicici: "ICICI Bank",
      oksbi: "State Bank of India",
      paytm: "Paytm",
      ybl: "PhonePe",
      amazonpay: "Amazon Pay",
      googlepay: "Google Pay",
      airtel: "Airtel Money",
      freecharge: "Freecharge",
      mobikwik: "MobiKwik",
      jupiteraxis: "Jupiter",
      razorpay: "Razorpay",
      bharatpe: "BharatPe",
    };
    return map[bankCode.toLowerCase()] ?? null;
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();
    if (lower.includes("sent") && lower.includes("from kotak")) return "EXPENSE";
    if (lower.includes("debited")) return "EXPENSE";
    if (lower.includes("withdrawn")) return "EXPENSE";
    if (lower.includes("spent")) return "EXPENSE";
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

  protected override extractReference(message: string): string | null {
    const m = /UPI\s+Ref\s+([0-9]+)/i.exec(message);
    if (m?.[1]) return m[1].trim();
    return super.extractReference(message);
  }

  protected override extractAccountLast4(message: string): string | null {
    const m = /AC\s+[X*]*([0-9]{4})(?:\s|,|\.)/i.exec(message);
    if (m?.[1]) return m[1];
    return super.extractAccountLast4(message);
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();
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
    if (
      lower.includes("has requested") ||
      lower.includes("payment request") ||
      lower.includes("collect request") ||
      lower.includes("requesting payment") ||
      lower.includes("requests rs") ||
      lower.includes("ignore if already paid")
    )
      return false;
    const keywords = [
      "sent",
      "debited",
      "credited",
      "withdrawn",
      "deposited",
      "spent",
      "received",
      "transferred",
      "paid",
    ];
    return keywords.some((k) => lower.includes(k));
  }
}
