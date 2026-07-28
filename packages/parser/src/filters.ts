const OTP_KEYWORDS = [
  'otp',
  'one time password',
  'one-time password',
  'verification code',
  'is your password',
  'do not share',
  'never share',
  'is the otp',
  'is your otp',
  'kyc',
  'update your kyc',
  'complete your kyc',
  'promo',
  'special offer',
  'discount',
  'cashback offer',
  'get cashback',
  'insurance premium',
  'pre-approved loan',
  'loan offer',
  'min amount due',
  'minimum amount due',
  'minimum due',
  'in arrears',
  'is overdue',
  'ignore if paid',
  'pls pay min',
  'payment request from',
  'collect request',
  'e-statement',
  'your statement is',
  'reward points',
  'reward point',
  'we are pleased',
] as const;

const TRANSACTION_KEYWORDS = [
  'debited',
  'credited',
  'withdrawn',
  'deposited',
  'spent',
  'received',
  'payment of',
  'transaction of',
  'txn of',
  'purchase of',
  'sent rs',
  'sent inr',
  'sent ₹',
  'transferred',
] as const;

export function isTransactionMessage(body: string): boolean {
  const lower = body.toLowerCase();
  for (const kw of OTP_KEYWORDS) {
    if (lower.includes(kw)) return false;
  }
  for (const kw of TRANSACTION_KEYWORDS) {
    if (lower.includes(kw)) return true;
  }
  return false;
}
