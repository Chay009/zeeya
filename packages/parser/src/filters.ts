export const SmsFilter = {
  isTransactionMessage(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    if (
      lowerMessage.includes("otp") ||
      lowerMessage.includes("one time password") ||
      lowerMessage.includes("verification code")
    )
      return false;
    if (
      lowerMessage.includes("offer") ||
      lowerMessage.includes("discount") ||
      lowerMessage.includes("cashback offer") ||
      lowerMessage.includes("win ")
    )
      return false;
    if (
      lowerMessage.includes("has requested") ||
      lowerMessage.includes("payment request") ||
      lowerMessage.includes("collect request") ||
      lowerMessage.includes("requesting payment") ||
      lowerMessage.includes("requests rs") ||
      lowerMessage.includes("ignore if already paid")
    )
      return false;
    if (lowerMessage.includes("have received payment")) return false;
    if (
      lowerMessage.includes("is due") ||
      lowerMessage.includes("min amount due") ||
      lowerMessage.includes("minimum amount due") ||
      lowerMessage.includes("in arrears") ||
      lowerMessage.includes("is overdue") ||
      lowerMessage.includes("ignore if paid") ||
      (lowerMessage.includes("pls pay") && lowerMessage.includes("min of"))
    )
      return false;
    const transactionKeywords = [
      "debited",
      "credited",
      "withdrawn",
      "withdrawal",
      "withdrawing",
      "deposited",
      "spent",
      "received",
      "transferred",
      "paid",
      "credit",
      "debit",
    ];
    return transactionKeywords.some((kw) => lowerMessage.includes(kw));
  },
};
