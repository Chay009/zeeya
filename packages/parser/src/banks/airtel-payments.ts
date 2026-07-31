// Exact 1:1 port of AirtelPaymentsBankParser.kt from Cashiro parser-core
import { BankParser } from '../base-parser.js';
import type { TransactionType } from '../types.js';

export class AirtelPaymentsBankParser extends BankParser {
  getBankName(): string {
    return 'Airtel Payments Bank';
  }

  canHandle(sender: string): boolean {
    const normalizedSender = sender.toUpperCase();
    // Only handle Airtel Payments Bank, not prepaid recharges (Airtel-S)
    return normalizedSender.includes('AIRBNK');
  }

  protected override extractAmount(message: string): number | null {
    const amountPatterns = [
      // "credited with Rs.20.00"
      /credited\s+with\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
      // "Rs. 5.00 debited from"
      /Rs\.?\s*([0-9,]+(?:\.\d{2})?)\s+debited\s+from/i,
      // "debited with Rs.5.00" (potential variant)
      /debited\s+with\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
    ];

    for (const pattern of amountPatterns) {
      const match = pattern.exec(message);
      if (match?.[1]) {
        const val = parseFloat(match[1].replace(/,/g, ''));
        if (!isNaN(val)) return val;
      }
    }

    return super.extractAmount(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('credited with')) return 'INCOME';
    if (lowerMessage.includes('is credited')) return 'INCOME';
    if (lowerMessage.includes('credit')) return 'INCOME';

    if (lowerMessage.includes('debited from')) return 'EXPENSE';
    if (lowerMessage.includes('debited with')) return 'EXPENSE';
    if (lowerMessage.includes('debit')) return 'EXPENSE';

    return super.extractTransactionType(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('airtel payments bank')) {
      return 'Airtel Payments Bank Transaction';
    }
    return super.extractMerchant(message, sender) ?? 'Airtel Payments Bank';
  }

  protected override extractReference(message: string): string | null {
    // Pattern: "Txn ID: 560992310006" or "Txn ID xxxxxxxx"
    const txnIdMatch = /Txn\s+ID[:\s]+([A-Z0-9]+)/i.exec(message);
    if (txnIdMatch?.[1]) {
      const txnId = txnIdMatch[1];
      // Filter out masked IDs like "xxxxxxxx" — no reference when masked
      if (txnId.toLowerCase().includes('x')) return null;
      return txnId;
    }

    // Alternative pattern for transaction ID
    const altTxnMatch = /Transaction\s+ID[:\s]+([A-Z0-9]+)/i.exec(message);
    if (altTxnMatch?.[1]) {
      return altTxnMatch[1];
    }

    return super.extractReference(message);
  }

  protected override extractBalance(message: string): number | null {
    // Pattern: "Bal:15.56"
    const balMatch = /Bal[:\s]+([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (balMatch?.[1]) {
      const val = parseFloat(balMatch[1].replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    // Alternative pattern: "Balance: Rs. 15.56"
    const altBalMatch = /Balance[:\s]+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (altBalMatch?.[1]) {
      const val = parseFloat(altBalMatch[1].replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    return super.extractBalance(message);
  }

  protected override isTransactionMessage(message: string): boolean {
    const lowerMessage = message.toLowerCase();

    // Skip OTP and non-transaction messages
    if (
      lowerMessage.includes('otp') ||
      lowerMessage.includes('verification') ||
      lowerMessage.includes('request') ||
      lowerMessage.includes('failed')
    ) {
      return false;
    }

    // Check for Airtel Payments Bank specific transaction patterns
    if (
      lowerMessage.includes('credited with') ||
      lowerMessage.includes('debited from') ||
      (lowerMessage.includes('airtel payments bank') &&
        (lowerMessage.includes('credited') || lowerMessage.includes('debited')))
    ) {
      return true;
    }

    return super.isTransactionMessage(message);
  }
}
