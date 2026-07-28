export type TransactionType = 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'INVESTMENT';

export interface SmsInput {
  body: string;
  sender: string;
  timestamp: number;
}

export interface ParsedTransaction {
  amount: number;
  currency: string;
  type: TransactionType;
  merchant: string | null;
  accountLast4: string | null;
  bankName: string;
  reference: string | null;
  balance: number | null;
  isFromCard: boolean;
  upiId: string | null;
}

export interface ParseResult extends ParsedTransaction {
  raw: string;
  sender: string;
  timestamp: number;
  confidence: number;
}
