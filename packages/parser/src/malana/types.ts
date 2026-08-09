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
  category: string | null;
  tags: Record<string, string>;
  tokens: Token[];
}
