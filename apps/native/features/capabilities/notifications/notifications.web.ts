import type { ParsedSms } from "@/lib/sms";

export async function requestTransactionNotificationPermission(): Promise<boolean> {
  return false;
}

export async function notifyNewFinancialTransactions(_messages: ParsedSms[]): Promise<void> {}
