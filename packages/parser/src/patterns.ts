// Exact 1:1 port of CompiledPatterns.kt from Cashiro parser-core

export const CompiledPatterns = {
  Amount: {
    RS_PATTERN: /Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
    INR_PATTERN: /INR\s*([0-9,]+(?:\.\d{2})?)/i,
    RUPEE_SYMBOL_PATTERN: /₹\s*([0-9,]+(?:\.\d{2})?)/,
    get ALL_PATTERNS() {
      return [this.RS_PATTERN, this.INR_PATTERN, this.RUPEE_SYMBOL_PATTERN];
    },
  },

  Reference: {
    GENERIC_REF: /(?:Ref|Reference|Txn|Transaction)(?:\s+No)?[:\s]+([A-Z0-9]+)/i,
    UPI_REF: /UPI[:\s]+([0-9]+)/i,
    REF_NUMBER: /Reference\s+Number[:\s]+([A-Z0-9]+)/i,
    get ALL_PATTERNS() {
      return [this.GENERIC_REF, this.UPI_REF, this.REF_NUMBER];
    },
  },

  Account: {
    AC_WITH_MASK: /(?:A\/c|Account|Acct)(?:\s+No)?\.?\s+(?:[Xx*]*\**)?(\d+)/i,
    CARD_WITH_MASK: /Card\s+(?:[Xx*]*\**)?(\d+)/i,
    GENERIC_ACCOUNT: /(?:A\/c|Account).*?(\d+)(?:\s|$)/i,
    get ALL_PATTERNS() {
      return [this.AC_WITH_MASK, this.CARD_WITH_MASK, this.GENERIC_ACCOUNT];
    },
  },

  Balance: {
    AVL_BAL_RS: /(?:Bal|Balance|Avl Bal|Available Balance)[:\s]+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
    AVL_BAL_INR: /(?:Bal|Balance|Avl Bal|Available Balance)[:\s]+INR\s*([0-9,]+(?:\.\d{2})?)/i,
    AVL_BAL_RUPEE: /(?:Bal|Balance|Avl Bal|Available Balance)[:\s]+₹\s*([0-9,]+(?:\.\d{2})?)/i,
    AVL_BAL_NO_CURRENCY: /(?:Bal|Balance|Avl Bal|Available Balance)[:\s]+([0-9,]+(?:\.\d{2})?)/i,
    UPDATED_BAL_RS: /(?:Updated Balance|Remaining Balance)[:\s]+Rs\.?\s*([0-9,]+(?:\.\d{2})?)/i,
    UPDATED_BAL_INR: /(?:Updated Balance|Remaining Balance)[:\s]+INR\s*([0-9,]+(?:\.\d{2})?)/i,
    get ALL_PATTERNS() {
      return [
        this.AVL_BAL_RS,
        this.AVL_BAL_INR,
        this.AVL_BAL_RUPEE,
        this.AVL_BAL_NO_CURRENCY,
        this.UPDATED_BAL_RS,
        this.UPDATED_BAL_INR,
      ];
    },
  },

  Merchant: {
    TO_PATTERN: /to\s+([^.\n]+?)(?:\s+on|\s+at|\s+Ref|\s+UPI)/i,
    FROM_PATTERN: /from\s+([^.\n]+?)(?:\s+on|\s+at|\s+Ref|\s+UPI)/i,
    AT_PATTERN: /at\s+([^.\n]+?)(?:\s+on|\s+Ref)/i,
    FOR_PATTERN: /for\s+([^.\n]+?)(?:\s+on|\s+at|\s+Ref)/i,
    get ALL_PATTERNS() {
      return [this.TO_PATTERN, this.FROM_PATTERN, this.AT_PATTERN, this.FOR_PATTERN];
    },
  },

  HDFC: {
    DLT_PATTERNS: [
      /^[A-Z]{2}-HDFCBK.*$/,
      /^[A-Z]{2}-HDFC.*$/,
      /^HDFC-[A-Z]+$/,
      /^[A-Z]{2}-HDFCB.*$/,
    ],
    SALARY_PATTERN: /for\s+[^-]+-[^-]+-[^-]+\s+[A-Z]+\s+SALARY-([^.\n]+)/i,
    SIMPLE_SALARY_PATTERN: /SALARY[- ]([^.\n]+?)(?:\s+Info|$)/i,
    INFO_PATTERN: /Info:\s*(?:UPI\/)?([^/.\n]+?)(?:\/|$)/i,
    VPA_WITH_NAME: /VPA\s+[^@\s]+@[^\s]+\s*\(([^)]+)\)/i,
    VPA_PATTERN: /VPA\s+([^@\s]+)@/i,
    SPENT_PATTERN: /at\s+([^.\n]+?)\s+on\s+\d{2}/i,
    DEBIT_FOR_PATTERN: /debited\s+for\s+([^.\n]+?)\s+on\s+\d{2}/i,
    MANDATE_PATTERN: /To\s+([^\n]+?)\s*(?:\n|\d{2}\/\d{2})/i,
    REF_SIMPLE: /Ref\s+(\d{9,12})/i,
    UPI_REF_NO: /UPI\s+Ref\s+No\s+(\d{12})/i,
    REF_NO: /Ref\s+No\.?\s+([A-Z0-9]+)/i,
    REF_END: /(?:Ref|Reference)[:.\\s]+([A-Z0-9]{6,})(?:\s*$|\s*Not\s+You)/i,
    ACCOUNT_DEPOSITED: /deposited\s+in\s+(?:HDFC\s+Bank\s+)?A\/c\s+(?:XX+)?(\d+)/i,
    ACCOUNT_FROM: /from\s+(?:HDFC\s+Bank\s+)?A\/c\s+(?:XX+)?(\d+)/i,
    ACCOUNT_SIMPLE: /HDFC\s+Bank\s+A\/c\s+(\d+)/i,
    ACCOUNT_GENERIC: /A\/c\s+(?:XX+)?(\d+)/i,
    AMOUNT_WILL_DEDUCT: /Rs\.?\s*([0-9,]+(?:\.\d{2})?)\s+will\s+be\s+deducted/i,
    DEDUCTION_DATE: /deducted\s+on\s+(\d{2}\/\d{2}\/\d{2}),?\s*\d{2}:\d{2}:\d{2}/i,
    MANDATE_MERCHANT: /For\s+([^\n]+?)\s+mandate/i,
    UMN_PATTERN: /UMN\s+([a-zA-Z0-9@]+)/i,
  },

  Cleaning: {
    TRAILING_PARENTHESES: /\s*\(.*?\)\s*$/,
    REF_NUMBER_SUFFIX: /\s+Ref\s+No.*/i,
    DATE_SUFFIX: /\s+on\s+\d{2}.*/,
    UPI_SUFFIX: /\s+UPI.*/i,
    TIME_SUFFIX: /\s+at\s+\d{2}:\d{2}.*/,
    TRAILING_DASH: /\s*-\s*$/,
    PVT_LTD: /(\s+PVT\.?\s*LTD\.?|\s+PRIVATE\s+LIMITED)$/i,
    LTD: /(\s+LTD\.?|\s+LIMITED)$/i,
  },
} as const;
