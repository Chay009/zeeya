export interface Token {
  type: string;
  raw: string;
  text: string;
  values: Record<string, string>;
  locked: boolean;
  matched: boolean;
  children: Token[];
}

export interface GrammarRule {
  skipCount: number;
  types: string[] | null;
}

export type GrammarMap = Map<string, GrammarRule>;

export interface CompiledGrammar {
  layers: GrammarMap[];
  patterns: string[];
}

export interface SeedData {
  TOKENS: Record<string, string>;
  GRAMMAR: Record<string, {
    GRMR: Array<Record<string, string>>;
    STRUCT: string[];
    PATTERN: string[];
  }>;
  CLASSIFIER: Record<string, string[]>;
}

export type TrxTypeRich =
  | 'EXPENSE'          // money leaving the account (debit, UPI pay, card spend)
  | 'INCOME'           // money arriving (credit, refund)
  | 'TRANSFER'         // inter-bank move: NEFT / IMPS / RTGS / AEPS
  | 'INVESTMENT'       // MF / SIP / stocks / equity
  | 'BALANCE_UPDATE'   // balance notification with no transaction amount
  | 'SALARY'           // salary / wage credit
  | 'AUTO_DEBIT'       // autopay / standing instruction debit
  | 'RECHARGE'         // mobile / DTH / utility recharge
  | 'WALLET_CREDIT'    // wallet top-up or load
  | 'WALLET_DEBIT'     // wallet spend or deduction
  | 'ATM_WITHDRAWAL';  // ATM cash withdrawal

export interface MalanaResult {
  category: string | null;       // GRM_BANK | GRM_OTP | GRM_TRAVEL | GRM_BILL | GRM_DELIVERY | etc.
  tags: Record<string, string>;  // all grammar tags: trx, bal, acc, type, ref, bene, etc.
  tokens: Token[];

  // ── Derived convenience fields ─────────────────────────────────────────────
  bankName: string | null;           // from vendor_banks sender match + message body fallback
  merchantCategory: string | null;   // from vendor_seed: food, travel, fuel, medical, etc.
  subcategory: string | null;        // upi | neft | imps | autdbt | cheque | wallet | etc.

  // ── Bank-specific (GRM_BANK) ───────────────────────────────────────────────
  trx: string | null;                // transaction amount
  bal: string | null;                // balance
  acc: string | null;                // account (last4 or masked)
  trxType: string | null;            // raw seed type: debit | credit | upi | neft | imps | rtgs | etc.
  trxTypeRich: TrxTypeRich | null;   // enriched type derived from trxType + tag presence
  currency: string | null;           // ISO 4217: INR | USD | EUR | GBP | AED | SGD …
  isFromCard: boolean;               // true when the INS token was creditcard or debitcard
  creditLimit: string | null;        // available credit limit (from crdlmt tag)
  ref: string | null;                // reference number
  bene: string | null;               // beneficiary name
  beneAcc: string | null;            // beneficiary account
  vendor: string | null;             // extracted merchant/vendor name (from PATTERN)
  location: string | null;           // location (from PATTERN)

  // ── OTP (GRM_OTP) ─────────────────────────────────────────────────────────
  otp: string | null;
  otpExpiry: string | null;

  // ── Travel (GRM_TRAVEL) ───────────────────────────────────────────────────
  pnr: string | null;
  flight: string | null;             // flight number/name
  departure: string | null;          // departure time/station
  arrival: string | null;            // arrival time/station
  fare: string | null;               // ticket fare amount
  trainBusNo: string | null;         // train or bus number
  boardingGate: string | null;
  departureCode: string | null;      // IATA code resolved from departure city (airport.json)
  arrivalCode: string | null;        // IATA code resolved from arrival city (airport.json)

  // ── Delivery (GRM_DELIVERY) ───────────────────────────────────────────────
  orderNo: string | null;
  trackingId: string | null;
  deliveryStatus: string | null;
  item: string | null;               // item name (from PATTERN #item)

  // ── Bill / Subscription (GRM_BILL) ────────────────────────────────────────
  billAmount: string | null;
  emiAmount: string | null;
  dueDate: string | null;
  policyNo: string | null;
  rechargeAmount: string | null;
  mandateAmount: string | null;
  // UMN (Unique Mandate Number) — stable across a mandate's whole lifecycle
  // (create/execute/cancel messages all reference the same UMN). Not part of
  // the ported grammar — Truecaller's own engine doesn't track this; see
  // regex-tokenizer.ts's MANDATEID token for the extraction rationale.
  mandateId: string | null;
  // Only "active"/"cancelled" — the real seed dictionary has a genuine keyword
  // signal for cancellation (RESCHE) but none for creation vs. execution, so
  // that distinction isn't invented. See enrichment.ts's isMandateCancelled.
  mandateEvent: 'active' | 'cancelled' | null;

  // ── Offers (GRM_OFFERS) ───────────────────────────────────────────────────
  cashback: string | null;
  discount: string | null;
  offerCode: string | null;
  offerCategory: string | null;      // sender-code category from offers.json (fashion, travel, etc.)

  // ── Telecom (GRM_TELECOM) ─────────────────────────────────────────────────
  dataLeft: string | null;
  packBalance: string | null;

  // ── Stocks / Investments (GRM_STOCKUPDATES) ───────────────────────────────
  navValue: string | null;
  folio: string | null;
  marginAmount: string | null;

  // ── Brand enrichment ──────────────────────────────────────────────────────
  brandName: string | null;          // detected brand from vendor_brands.json
  isOnlineBrand: boolean;            // true if brand is tagged "online"

  // ── UPI ───────────────────────────────────────────────────────────────────────
  upiHandle: string | null;          // UPI handle from bene VPA (e.g. "airtel", "paytm")

  // ── Spam detection (Naive Bayes classifier) ───────────────────────────────────
  isSpam: boolean;                   // true when message scores as promotional/spam
  spamScore: number;                 // log-likelihood ratio: positive = transactional, negative = spam
}
