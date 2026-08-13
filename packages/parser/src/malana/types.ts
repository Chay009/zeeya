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
    STRUCT: unknown[];
    PATTERN: string[];
  }>;
  CLASSIFIER: Record<string, string[]>;
}

export interface MalanaResult {
  category: string | null;       // GRM_BANK | GRM_OTP | GRM_TRAVEL | GRM_BILL | GRM_DELIVERY | etc.
  tags: Record<string, string>;  // raw grammar tags: trx, bal, acc, type, ref, bene, etc.
  tokens: Token[];

  // Derived convenience fields
  bankName: string | null;           // from vendor_banks sender match + message body fallback
  merchantCategory: string | null;   // from vendor_seed: food, travel, fuel, medical, etc.
  subcategory: string | null;        // upi | neft | imps | autdbt | cheque | withdraw | refund | etc.
}
