export async function requestTransactionNotificationPermission(): Promise<boolean> {
  return false;
}

export async function notifyNewFinancialTransactions(_count: number): Promise<void> {}
