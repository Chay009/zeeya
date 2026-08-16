// Exact 1:1 port of DOPBankParser.kt from Cashiro parser-core
import { BankParser } from "../base-parser.js";
import type { ParsedTransaction, TransactionType } from "../types.js";

function parseNum(str: string): number | null {
  const n = parseFloat(str.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeUnicodeText(text: string): string {
  return (
    text
      .normalize("NFKD")
      // Control-char range (0x00-0x1F) is intentional — strips any non-ASCII
      // byte, control characters included, same as the other bank parsers.
      // oxlint-disable-next-line no-control-regex
      .replace(/[^\x00-\x7F]/g, " ") // Replace non-ASCII with space
      .replace(/\s+/g, " ") // Collapse multiple spaces
      .trim()
  );
}

export class DOPBankParser extends BankParser {
  getBankName(): string {
    return "Department of Post";
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      u.includes("DOPBNK") ||
      u.includes("DEPARTMENT OF POST") ||
      u.includes("DOP-") ||
      u.endsWith("-DOP") ||
      u === "DOP"
    );
  }

  override parse(smsBody: string, sender: string, timestamp: number): ParsedTransaction | null {
    const normalizedBody = normalizeUnicodeText(smsBody);
    return super.parse(normalizedBody, sender, timestamp);
  }

  protected override extractAmount(message: string): number | null {
    const amountPattern = /amount\s+(?:Rs\.?|INR)?\s*([\d,]+(?:\.\d{2})?)/i;
    const match = amountPattern.exec(message);
    if (match?.[1]) {
      const val = parseNum(match[1]);
      if (val !== null) return val;
    }
    return super.extractAmount(message);
  }

  protected override extractAccountLast4(message: string): string | null {
    const accountPattern = /Acc(?:ount)?\s*(?:No\.?)?\s+(?:[X*]+)?(\d{4})/i;
    const match = accountPattern.exec(message);
    if (match?.[1]) {
      return match[1];
    }
    return super.extractAccountLast4(message);
  }

  protected override extractTransactionType(message: string): TransactionType | null {
    const lower = message.toLowerCase();
    if (lower.includes("credit")) return "INCOME";
    if (lower.includes("debit")) return "EXPENSE";
    return super.extractTransactionType(message);
  }

  protected override extractBalance(message: string): number | null {
    const balancePattern = /Bal(?:ance)?\s*(?::)?\s*(?:Rs\.?|INR)?\s*([\d,]+(?:\.\d{2})?)/i;
    const match = balancePattern.exec(message);
    if (match?.[1]) {
      const val = parseNum(match[1]);
      if (val !== null) return val;
    }
    return super.extractBalance(message);
  }

  protected override extractReference(message: string): string | null {
    const refPattern = /\[([A-Z0-9]+)\]/i;
    const match = refPattern.exec(message);
    if (match?.[1]) {
      return match[1];
    }
    return super.extractReference(message);
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();
    const hasKeyKeywords =
      lower.includes("account") || lower.includes("a/c") || lower.includes("dop");
    const hasType = lower.includes("credit") || lower.includes("debit");
    return hasKeyKeywords && hasType;
  }
}
