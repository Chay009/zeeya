// Exact 1:1 port of UnionBankParser.kt from Cashiro parser-core
import { BankParser } from '../base-parser.js';

export class UnionBankParser extends BankParser {
  getBankName(): string {
    return 'Union Bank of India';
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      u.includes('UNIONB') ||
      u.includes('UNIONBANK') ||
      u.includes('UBOI') ||
      /^[A-Z]{2}-UNIONB-[ST]$/.test(u) ||
      /^[A-Z]{2}-UNIONB-[TPG]$/.test(u) ||
      /^[A-Z]{2}-UNIONB$/.test(u) ||
      /^[A-Z]{2}-UNIONBANK$/.test(u)
    );
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();
    const keywords = ['debited','credited','withdrawn','deposited','spent','received','transferred','paid'];
    if (keywords.some(k => lower.includes(k))) return true;
    return super.isTransactionMessage(message);
  }

  protected override extractAmount(message: string): number | null {
    const m1 = /Rs[:.]?\s*([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (m1?.[1]) {
      const val = parseFloat(m1[1].replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    const m2 = /INR\s+([0-9,]+(?:\.\d{2})?)/i.exec(message);
    if (m2?.[1]) {
      const val = parseFloat(m2[1].replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }

    return super.extractAmount(message);
  }

  protected override extractMerchant(message: string, sender: string): string | null {
    if (/Mob\s+Bk/i.test(message)) return 'Mobile Banking Transfer';

    if (/ATM/i.test(message)) {
      const atmMatch = /at\s+([^.\s]+(?:\s+[^.\s]+)*)(?:\s+on|\s+Avl|$)/i.exec(message);
      if (atmMatch?.[1]) return this.cleanMerchantName(atmMatch[1].trim());
      return 'ATM Withdrawal';
    }

    if (/UPI/i.test(message)) {
      const upiMatch = /UPI[/:]?\s*([^,.\s]+)/i.exec(message);
      if (upiMatch?.[1]) return this.cleanMerchantName(upiMatch[1].trim());
    }

    if (/VPA/i.test(message)) {
      const vpaMatch = /VPA\s+([^@\s]+)/i.exec(message);
      if (vpaMatch?.[1]) return this.parseUPIMerchant(vpaMatch[1].trim());
    }

    const toMatch = /to\s+([^.\n]+?)(?:\s+on|\s+Avl|$)/i.exec(message);
    if (toMatch?.[1]) {
      const m = toMatch[1].trim();
      if (!m.toLowerCase().includes('avl')) return this.cleanMerchantName(m);
    }

    const fromMatch = /from\s+([^.\n]+?)(?:\s+on|\s+Avl|$)/i.exec(message);
    if (fromMatch?.[1]) {
      const m = fromMatch[1].trim();
      if (!m.toLowerCase().includes('avl')) return this.cleanMerchantName(m);
    }

    return super.extractMerchant(message, sender);
  }

  protected override extractReference(message: string): string | null {
    const patterns = [
      /ref\s+no\s+([\w]+)/i,
      /ref[:#]?\s*([\w]+)/i,
      /reference[:#]?\s*([\w]+)/i,
      /txn[:#]?\s*([\w]+)/i,
    ];
    for (const p of patterns) {
      const m = p.exec(message);
      if (m?.[1]) return m[1].trim();
    }
    return super.extractReference(message);
  }

  protected override extractAccountLast4(message: string): string | null {
    const patterns = [
      /A\/[Cc]\s*[*X](\d{4})/i,
      /Account\s*[*X](\d{4})/i,
      /Acc\s*[*X](\d{4})/i,
      /A\/[Cc]\s+(\d{4})/i,
    ];
    for (const p of patterns) {
      const m = p.exec(message);
      if (m?.[1]) return m[1];
    }
    return super.extractAccountLast4(message);
  }

  protected override extractBalance(message: string): number | null {
    const patterns = [
      /Avl\s+Bal\s+Rs[:.]?\s*([0-9,]+(?:\.\d{2})?)/i,
      /Available\s+Balance[:.]?\s*Rs[:.]?\s*([0-9,]+(?:\.\d{2})?)/i,
      /Balance[:.]?\s*Rs[:.]?\s*([0-9,]+(?:\.\d{2})?)/i,
      /Bal[:.]?\s*Rs[:.]?\s*([0-9,]+(?:\.\d{2})?)/i,
    ];
    for (const p of patterns) {
      const m = p.exec(message);
      if (m?.[1]) {
        const val = parseFloat(m[1].replace(/,/g, ''));
        if (!isNaN(val)) return val;
      }
    }
    return super.extractBalance(message);
  }

  private parseUPIMerchant(vpa: string): string {
    const lower = vpa.toLowerCase();
    if (lower.includes('paytm')) return 'Paytm';
    if (lower.includes('phonepe')) return 'PhonePe';
    if (lower.includes('googlepay') || lower.includes('gpay')) return 'Google Pay';
    if (lower.includes('bharatpe')) return 'BharatPe';
    if (lower.includes('amazon')) return 'Amazon';
    if (lower.includes('flipkart')) return 'Flipkart';
    if (lower.includes('swiggy')) return 'Swiggy';
    if (lower.includes('zomato')) return 'Zomato';
    if (lower.includes('uber')) return 'Uber';
    if (lower.includes('ola')) return 'Ola';
    if (/^\d+$/.test(lower)) return 'Individual';
    const parts = lower.split(/[.\-_]/);
    const meaningful = parts.find(p => p.length > 3 && !/^\d+$/.test(p));
    return meaningful
      ? meaningful.charAt(0).toUpperCase() + meaningful.slice(1)
      : 'Merchant';
  }
}
