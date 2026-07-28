// Exact 1:1 port of FederalBankParser.kt from Cashiro parser-core
import { BankParser } from '../base-parser.js';
import type { MandateInfo, TransactionType } from '../types.js';

function parseNum(str: string): number | null {
  const n = parseFloat(str.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export class FederalBankParser extends BankParser {
  getBankName(): string {
    return 'Federal Bank';
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      u.includes('FEDBNK') ||
      u.includes('FEDERAL') ||
      u.includes('FEDFIB') ||
      u.includes('FEDSCP') ||
      /^[A-Z]{2}-FEDBNK-S$/.test(u) ||
      /^[A-Z]{2}-FEDSCP-S$/.test(u) ||
      /^[A-Z]{2}-FedFiB-[A-Z]$/.test(u) ||
      /^[A-Z]{2}-FEDBNK-[TPG]$/.test(u) ||
      /^[A-Z]{2}-FEDBNK$/.test(u)
    );
  }

  detectIsCreditCard(message: string): boolean {
    return message.toLowerCase().includes('credit card');
  }

  /**
   * Detects if the transaction is from a card (credit/debit) based on Federal Bank specific
   * patterns.
   */
  override detectIsCard(message: string): boolean {
    const lower = message.toLowerCase();

    // Explicit credit card patterns
    if (this.detectIsCreditCard(message)) return true;

    // Explicit debit card patterns
    if (lower.includes('debit card')) return true;

    // Card number patterns: "card XX**9747" or "card ending with 1234"
    if (lower.includes('card xx**')) return true;
    if (lower.includes('card ending with')) return true;

    // INR spent pattern (typically credit card)
    if (/inr\s+[\d,]+(?:\.\d{2})?\s+spent/i.test(lower)) return true;

    // "at <merchant> on <date>" pattern (credit card transactions)
    if (lower.includes(' spent ') && lower.includes(' at ') && lower.includes(' on ')) return true;

    // E-mandate on card patterns
    if (
      (lower.includes('e-mandate') || lower.includes('payment of')) &&
      (lower.includes('federal bank debit card') || lower.includes('federal bank credit card'))
    ) return true;

    // Exclude UPI transactions (these are not card transactions)
    if (lower.includes('via upi')) return false;
    if (lower.includes('to vpa')) return false;

    // Exclude ATM withdrawals from being categorized as card transactions
    if (lower.includes('atm')) return false;
    if (lower.includes('withdrawn') && !lower.includes('card')) return false;

    // Exclude IMPS/NEFT/RTGS transfers
    if (lower.includes('via imps')) return false;
    if (lower.includes('via neft')) return false;
    if (lower.includes('via rtgs')) return false;

    return false;
  }

  protected override extractAmount(message: string): number | null {
    // Pattern 1: ₹882.00 (rupee symbol format for Scapia card)
    const p1 = /₹\s*([0-9,]+(?:\.\d{2})?)/.exec(message);
    if (p1?.[1]) {
      const val = parseNum(p1[1]);
      if (val !== null) return val;
    }

    // Pattern 2: INR 506.52 spent (credit card format)
    const p2 = /INR\s+([0-9,]+(?:\.\d{2})?)\s+spent/i.exec(message);
    if (p2?.[1]) {
      const val = parseNum(p2[1]);
      if (val !== null) return val;
    }

    // Pattern 3: "you've received INR 10,509.09"
    const p3 = /you've received INR\s+([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (p3?.[1]) {
      const val = parseNum(p3[1]);
      if (val !== null) return val;
    }

    // Pattern 4: Rs 34.51 debited via UPI
    const p4 = /Rs\s+([0-9,]+(?:\.\d{2})?)\s+debited/i.exec(message);
    if (p4?.[1]) {
      const val = parseNum(p4[1]);
      if (val !== null) return val;
    }

    // Pattern 5: Rs 70.00 sent via UPI
    const p5 = /Rs\s+([0-9,]+(?:\.\d{2})?)\s+sent/i.exec(message);
    if (p5?.[1]) {
      const val = parseNum(p5[1]);
      if (val !== null) return val;
    }

    // Pattern 6: Rs 500.00 credited
    const p6 = /Rs\s+([0-9,]+(?:\.\d{2})?)\s+credited/i.exec(message);
    if (p6?.[1]) {
      const val = parseNum(p6[1]);
      if (val !== null) return val;
    }

    // Pattern 7: withdrawn Rs 500
    const p7 = /withdrawn\s+Rs\s+([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (p7?.[1]) {
      const val = parseNum(p7[1]);
      if (val !== null) return val;
    }

    return super.extractAmount(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    // Priority 1: IMPS credits - show "IMPS Credit" instead of parsing description
    if (
      /credited to your A\/c/i.test(message) &&
      /via IMPS/i.test(message)
    ) {
      return 'IMPS Credit';
    }

    // Priority 2: Card transactions - use detectIsCard to avoid duplication
    if (this.detectIsCard(message)) {
      if (/\sat\s/i.test(message)) {
        // Pattern 1: "at <merchant> on your" (Scapia format)
        const scapiaMatch = /at\s+([^.\n]+?)\s+on\s+your/i.exec(message);
        if (scapiaMatch?.[1]) {
          const merchant = this.cleanMerchantName(scapiaMatch[1].trim());
          if (this.isValidMerchantName(merchant)) {
            const cleaned = merchant.replace(/\s+(limited|ltd|pvt\s+ltd|private\s+limited)$/i, '').trim();
            return cleaned.length > 0 ? cleaned : merchant;
          }
        }

        // Pattern 2: "at <merchant> on date" (traditional format)
        const ccMatch = /at\s+([^.\n]+?)\s+on\s+\d/i.exec(message);
        if (ccMatch?.[1]) {
          const merchant = this.cleanMerchantName(ccMatch[1].trim());
          if (this.isValidMerchantName(merchant)) {
            const cleaned = merchant.replace(/\s+(limited|ltd|pvt\s+ltd|private\s+limited)$/i, '').trim();
            return cleaned.length > 0 ? cleaned : merchant;
          }
        }
      }
    }

    // Priority 3: E-mandate transactions
    if (/e-mandate/i.test(message) || /payment of/i.test(message)) {
      const emandateMatch = /payment of\s+[^.]+?\s+for\s+([^.\n]+?)\s+via\s+e-mandate/i.exec(message);
      if (emandateMatch?.[1]) {
        const merchant = this.cleanMerchantName(emandateMatch[1].trim());
        if (this.isValidMerchantName(merchant)) {
          return merchant;
        }
      }

      const declinedMatch = /payment via e-mandate\s+declined\s+for\s+ID:\s*[^.]+?\s+on\s+Federal Bank\s+Debit Card\s+\d+/i.exec(message);
      if (declinedMatch) {
        return 'E-Mandate Declined';
      }
    }

    // Priority 4: UPI transactions - "to VPA merchant@bank"
    if (/VPA/i.test(message)) {
      const vpaMatch = /to\s+VPA\s+([^\s]+?)(?:\.\s*Ref\s+No|\s*Ref\s+No|$)/i.exec(message);
      if (vpaMatch?.[1]) {
        const vpa = vpaMatch[1].trim();
        return this.parseUPIMerchant(vpa);
      }
    }

    // Priority 5: "to <merchant name>" (general)
    const toMatch = /to\s+([^.\n]+?)(?:\.\s*Ref|Ref\s+No|$)/i.exec(message);
    if (toMatch?.[1]) {
      const merchant = toMatch[1].trim();
      if (!/VPA/i.test(merchant)) {
        const cleaned = this.cleanMerchantName(merchant);
        if (this.isValidMerchantName(cleaned)) {
          return cleaned;
        }
      }
    }

    // Priority 6: "you've received INR" transactions
    if (/you've received/i.test(message)) {
      const sentByMatch = /It was sent by\s+([^.\n]+?)(?:\s+on|$)/i.exec(message);
      if (sentByMatch?.[1]) {
        const senderName = sentByMatch[1].trim();
        if (/^0+$/.test(senderName) || senderName.length <= 4) {
          return 'Bank Transfer';
        }
        const merchant = this.cleanMerchantName(senderName);
        if (this.isValidMerchantName(merchant)) {
          return merchant;
        }
      }
    }

    // Priority 7: "from <sender name>"
    const fromMatch = /from\s+([^.\n]+?)(?:\.\s*|$)/i.exec(message);
    if (fromMatch?.[1]) {
      const merchant = this.cleanMerchantName(fromMatch[1].trim());
      if (this.isValidMerchantName(merchant)) {
        return merchant;
      }
    }

    // Priority 8: ATM transactions
    if (/ATM/i.test(message) || /withdrawn/i.test(message)) {
      return 'ATM Withdrawal';
    }

    return super.extractMerchant(message, sender);
  }

  private parseUPIMerchant(vpa: string): string {
    const cleanVPA = vpa.split('@')[0]?.toLowerCase() ?? '';

    // Airlines & Travel
    if (cleanVPA.includes('indigo')) return 'Indigo';
    if (cleanVPA.includes('spicejet')) return 'SpiceJet';
    if (cleanVPA.includes('airasia')) return 'AirAsia';
    if (cleanVPA.includes('vistara')) return 'Vistara';
    if (cleanVPA.includes('airindia')) return 'Air India';

    // Ride-hailing
    if (cleanVPA.includes('uber')) return 'Uber';
    if (cleanVPA.includes('ola')) return 'Ola';
    if (cleanVPA.includes('rapido')) return 'Rapido';

    // E-commerce
    if (cleanVPA.includes('amazon')) return 'Amazon';
    if (cleanVPA.includes('flipkart')) return 'Flipkart';
    if (cleanVPA.includes('myntra')) return 'Myntra';
    if (cleanVPA.includes('meesho')) return 'Meesho';

    // Payment apps
    if (cleanVPA.includes('paytm')) return 'Paytm';
    if (cleanVPA.includes('bharatpe')) return 'BharatPe';
    if (cleanVPA.includes('phonepe')) return 'PhonePe';
    if (cleanVPA.includes('googlepay') || cleanVPA.includes('gpay')) return 'Google Pay';

    // Food delivery
    if (cleanVPA.includes('swiggy')) return 'Swiggy';
    if (cleanVPA.includes('zomato')) return 'Zomato';

    // Entertainment
    if (cleanVPA.includes('netflix')) return 'Netflix';
    if (cleanVPA.includes('spotify')) return 'Spotify';
    if (cleanVPA.includes('hotstar') || cleanVPA.includes('disney')) return 'Disney+ Hotstar';
    if (cleanVPA.includes('prime')) return 'Amazon Prime';
    if (cleanVPA.includes('pvr') || cleanVPA.includes('inox')) return 'PVR Inox';
    if (cleanVPA.includes('bookmyshow') || cleanVPA.includes('bms')) return 'BookMyShow';

    // Telecom
    if (cleanVPA.includes('jio')) return 'Jio';
    if (cleanVPA.includes('airtel')) return 'Airtel';
    if (cleanVPA.includes('vodafone') || cleanVPA.includes('vi')) return 'Vi';
    if (cleanVPA.includes('bsnl')) return 'BSNL';

    // Travel
    if (cleanVPA.includes('irctc')) return 'IRCTC';
    if (cleanVPA.includes('redbus')) return 'RedBus';
    if (cleanVPA.includes('makemytrip') || cleanVPA.includes('mmt')) return 'MakeMyTrip';
    if (cleanVPA.includes('goibibo')) return 'Goibibo';
    if (cleanVPA.includes('oyo')) return 'OYO';
    if (cleanVPA.includes('airbnb')) return 'Airbnb';

    // Payment gateways
    if (
      cleanVPA.includes('razorpay') ||
      cleanVPA.includes('razorp') ||
      cleanVPA.includes('rzp')
    ) {
      if (cleanVPA.includes('pvr')) return 'PVR';
      if (cleanVPA.includes('inox')) return 'PVR Inox';
      if (cleanVPA.includes('swiggy')) return 'Swiggy';
      if (cleanVPA.includes('zomato')) return 'Zomato';
      return 'Online Payment';
    }
    if (
      cleanVPA.includes('payu') ||
      cleanVPA.includes('billdesk') ||
      cleanVPA.includes('ccavenue')
    ) return 'Online Payment';

    // Individual transfers
    if (/^\d+$/.test(cleanVPA)) return 'Individual';

    return vpa.trim();
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();

    // Skip OTP and promotional messages
    if (
      lower.includes('otp') ||
      lower.includes('one time password') ||
      lower.includes('verification code')
    ) {
      return false;
    }

    // Skip mandate creation notifications and declined payments
    if (this.isMandateCreationNotification(message) || this.isDeclinedMandatePayment(message)) {
      return false;
    }

    // Federal Bank specific transaction keywords
    const federalKeywords = [
      'sent via upi',
      'debited via upi',
      'credited',
      'withdrawn',
      'received',
      'transferred',
      'spent on your credit card',
      'credit card was successful',
      'payment of',
      'payment via e-mandate',
    ];

    if (federalKeywords.some(kw => lower.includes(kw))) {
      return true;
    }

    return super.isTransactionMessage(message);
  }

  protected override extractAccountLast4(message: string): string | null {
    // Only extract card numbers if this is actually a card transaction
    if (this.detectIsCard(message)) {
      // Pattern 1: "credit card ending with 1234" or "debit card ending with 1234"
      const p1 = /(?:credit|debit)\s+card\s+ending\s+with\s+(\d{4})/i.exec(message);
      if (p1?.[1]) return p1[1];

      // Pattern 2: "card XX**9747"
      const p2 = /card\s+XX\*\*?(\d{4})/i.exec(message);
      if (p2?.[1]) return p2[1];
    }

    // For non-card transactions, try base class patterns
    return super.extractAccountLast4(message);
  }

  protected override extractBalance(message: string): number | null {
    // Don't extract credit limit as balance
    return super.extractBalance(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();

    // Credit card transactions
    if (
      this.detectIsCreditCard(message) &&
      (lower.includes('spent') || (lower.includes('txn') && lower.includes('successful')))
    ) return 'CREDIT';

    // E-mandate payments (only successful ones)
    if (
      (lower.includes('e-mandate') || lower.includes('payment of')) &&
      lower.includes('processed successfully')
    ) return 'EXPENSE';

    // Expense keywords
    if (lower.includes('sent via upi')) return 'EXPENSE';
    if (lower.includes('debited')) return 'EXPENSE';
    if (lower.includes('withdrawn')) return 'EXPENSE';
    if (lower.includes('spent') && !this.detectIsCreditCard(message)) return 'EXPENSE';
    if (lower.includes('paid')) return 'EXPENSE';

    // Income keywords
    if (lower.includes('credited')) return 'INCOME';
    if (lower.includes('received')) return 'INCOME';
    if (lower.includes('deposited')) return 'INCOME';
    if (lower.includes('refund')) return 'INCOME';

    return super.extractTransactionType(message);
  }

  isMandateCreationNotification(message: string): boolean {
    const lower = message.toLowerCase();
    return (
      (lower.includes('mandate') || lower.includes('e-mandate')) &&
      (lower.includes('successfully created a mandate') ||
        lower.includes('you have successfully created') ||
        lower.includes('successfully created') ||
        lower.includes('has been initiated') ||
        lower.includes('registration has been initiated'))
    );
  }

  isDeclinedMandatePayment(message: string): boolean {
    const lower = message.toLowerCase();
    return (
      (lower.includes('e-mandate') || lower.includes('payment of')) &&
      lower.includes('declined')
    );
  }

  parseEMandateSubscription(message: string): MandateInfo | null {
    if (!this.isMandateCreationNotification(message)) return null;

    const amountMatch = /(?:for\s+a\s+)?maximum\s+amount\s+of\s+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i.exec(message);
    if (!amountMatch?.[1]) return null;
    const amount = parseNum(amountMatch[1]);
    if (amount === null) return null;

    const dateMatch = /starting\s+from\s+(\d{2}-\d{2}-\d{4})/i.exec(message);
    const startDate = dateMatch?.[1] ?? null;

    const merchantMatch = /(?:created\s+a\s+mandate\s+on|mandate\s+on)\s+([^.\n]+?)(?:\s+for|\s*$)/i.exec(message);
    const merchant = merchantMatch?.[1]
      ? this.cleanMerchantName(merchantMatch[1].trim())
      : 'Unknown Subscription';

    const umnMatch = /Mandate\s+Ref\s+No-?\s*([^.\s]+)/i.exec(message);
    const umn = umnMatch?.[1] ?? null;

    return {
      amount,
      nextDeductionDate: startDate,
      merchant,
      umn,
      dateFormat: 'dd-MM-yyyy',
    };
  }

  parseFutureDebit(message: string): MandateInfo | null {
    const lower = message.toLowerCase();
    if (!lower.includes('payment due') || !lower.includes('will be processed')) return null;

    const amountMatch = /INR\s+(\d+(?:,\d{3})*(?:\.\d{2})?)/i.exec(message);
    if (!amountMatch?.[1]) return null;
    const amount = parseNum(amountMatch[1]);
    if (amount === null) return null;

    let dueDate: string | null = null;
    const dateMatch = /on\s+(\d{2}\/\d{2}\/\d{4})/i.exec(message);
    if (dateMatch?.[1]) {
      const dateStr = dateMatch[1];
      try {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const year = parts[2] ?? '';
          dueDate = `${parts[0] ?? ''}/${parts[1] ?? ''}/${year.slice(-2)}`;
        } else {
          dueDate = dateStr;
        }
      } catch {
        dueDate = dateStr;
      }
    }

    const merchantMatch = /for\s+([^.\n]+?)\s*,\s*INR/i.exec(message);
    const merchant = merchantMatch?.[1]
      ? this.cleanMerchantName(merchantMatch[1].trim())
      : 'Unknown Subscription';

    return {
      amount,
      nextDeductionDate: dueDate,
      merchant,
      umn: null,
      dateFormat: 'dd-MM-yyyy',
    };
  }

  isTransactionMessageForTesting(message: string): boolean {
    return this.isTransactionMessage(message);
  }
}
