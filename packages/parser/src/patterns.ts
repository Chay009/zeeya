export const P = {
  Amount: {
    RS_AMOUNT:       /(?:Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
    INR_AMOUNT:      /INR\s*([\d,]+(?:\.\d{1,2})?)/i,
    AMOUNT_PREFIX:   /[Aa]mount\s*(?:of\s*)?(?:Rs\.?|₹|INR)\s*([\d,]+(?:\.\d{1,2})?)/i,
    AMOUNT_SUFFIX:   /([\d,]+(?:\.\d{1,2})?)\s*(?:Rs\.?|INR|₹)/i,
    CURRENCY_AMOUNT: /([A-Z]{3})\s*([\d,]+(?:\.\d{1,2})?)\s*(?:spent|debited|credited)/i,
  },
  Balance: {
    AVL_BAL:     /(?:Avl\.?\s*(?:Bal\.?|Balance)|Available\s*Bal(?:ance)?)[:\s]+(?:(?:Rs\.?|₹|INR)\s*)?([\d,]+(?:\.\d{1,2})?)/i,
    UPDATED_BAL: /(?:Updated\s*Bal(?:ance)?|Remaining\s*Balance)[:\s]+(?:(?:Rs\.?|₹|INR)\s*)?([\d,]+(?:\.\d{1,2})?)/i,
    BAL_IS:      /[Bb]alance\s+(?:is|:)\s*(?:(?:Rs\.?|₹|INR)\s*)?([\d,]+(?:\.\d{1,2})?)/,
    BAL_COLON:   /\bBal[:\s]+(?:(?:Rs\.?|₹|INR)\s*)?([\d,]+(?:\.\d{1,2})?)/,
  },
  Merchant: {
    TO:   /\bto\s+([A-Za-z0-9][^.\n,@]{2,50}?)(?:\s+(?:on|at|Ref|UPI|via|for|using)\b|\.|,|$)/i,
    FROM: /\bfrom\s+([A-Za-z0-9][^.\n,@]{2,50}?)(?:\s+(?:on|at|Ref|UPI|via)\b|\.|,|$)/i,
    AT:   /\bat\s+([A-Za-z0-9][^.\n,@]{2,50}?)(?:\s+(?:on|Ref)\b|\.|,|$)/i,
    FOR:  /\bfor\s+([A-Za-z0-9][^.\n,@]{2,40}?)(?:\s+(?:on|at|Ref|from)\b|\.|,|$)/i,
  },
  Account: {
    AC:      /[Aa][\/.]?[Cc](?:count\s*(?:[Nn]o\.?)?)?[\s.]*[Xx*]{0,4}(\d{4})\b/,
    CARD:    /[Cc]ard[\s\w]*?[Xx*]{2,}(\d{4})\b/,
    ENDING:  /(?:ending|no\.?)\s*[Xx*]*(\d{4})\b/i,
    MASKED:  /[Xx*]{4,}(\d{4})\b/,
  },
  Reference: {
    REF:  /(?:[Rr]ef(?:erence)?\.?\s*(?:[Nn]o?\.?)?|UPI\s*[Rr]ef\.?\s*[Nn]o?\.?|Txn\s*(?:ID|[Nn]o)\.?)[:\s]*([A-Za-z0-9]{6,25})/,
    IMPS: /IMPS\s*[Rr]ef\.?\s*[Nn]o?\.?[:\s]*(\d{6,15})/i,
  },
  UPI: {
    VPA: /([a-zA-Z0-9._-]{2,}@[a-zA-Z]{2,})/,
  },
};
