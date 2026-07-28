import { createHash } from 'node:crypto';

export type TransactionType =
  | 'INCOME'
  | 'EXPENSE'
  | 'CREDIT'
  | 'TRANSFER'
  | 'INVESTMENT'
  | 'BALANCE_UPDATE';

export interface ParsedTransaction {
  amount: number;
  type: TransactionType;
  merchant: string | null;
  reference: string | null;
  accountLast4: string | null;
  balance: number | null;
  creditLimit: number | null;
  smsBody: string;
  sender: string;
  timestamp: number;
  bankName: string;
  transactionHash: string | null;
  isFromCard: boolean;
  currency: string;
  fromAccount: string | null;
  toAccount: string | null;
}

export interface MandateInfo {
  amount: number;
  nextDeductionDate: string | null;
  merchant: string;
  umn: string | null;
  dateFormat: string;
}

export interface BalanceUpdateInfo {
  bankName: string;
  accountLast4: string;
  balance: number;
  asOfDate: Date | null;
  isCreditCard: boolean;
}

export interface SmsInput {
  body: string;
  sender: string;
  timestamp: number;
}

export type ParseResult = ParsedTransaction | null;

export function generateTransactionId(tx: ParsedTransaction): string {
  const normalizedAmount = tx.amount.toFixed(2);
  const smsBodyHash = createHash('sha256')
    .update(tx.smsBody)
    .digest('hex')
    .slice(0, 16);
  const data = `${tx.sender}|${normalizedAmount}|${smsBodyHash}`;
  return createHash('sha256').update(data).digest('hex');
}
