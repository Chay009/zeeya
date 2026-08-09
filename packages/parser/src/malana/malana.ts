import type { Token, SeedData, MalanaResult } from './types';
import { regexTokenize } from './regex-tokenizer';
import { KeywordTokenizer } from './keyword-tokenizer';
import { compileSeed } from './grammar-compiler';
import { runGrammar } from './grammar-runner';

// Merge regex-extracted tokens with keyword tokens, sorted by position in message.
// Regex tokens take priority (they run first in the original engine);
// keyword tokens only fill uncovered positions.
function mergeTokens(regexTokens: Token[], keywordTokens: Token[], message: string): Token[] {
  const lower = message.toLowerCase();
  const positioned: Array<{ token: Token; pos: number; end: number }> = [];

  // 1. Place regex tokens first — find their position by scanning message
  for (const t of regexTokens) {
    const idx = message.indexOf(t.text);
    if (idx !== -1) {
      positioned.push({ token: t, pos: idx, end: idx + t.text.length });
    }
  }

  // 2. Place keyword tokens only where regex hasn't covered
  let searchFrom = 0;
  for (const t of keywordTokens) {
    const idx = lower.indexOf(t.text.toLowerCase(), searchFrom);
    if (idx === -1) continue;
    const end = idx + t.text.length;
    const overlaps = positioned.some(p => idx < p.end && end > p.pos);
    if (!overlaps) {
      positioned.push({ token: t, pos: idx, end });
    }
    searchFrom = idx + 1;
  }

  positioned.sort((a, b) => a.pos - b.pos);
  return positioned.map(p => p.token);
}

export class MalanaEngine {
  private keywordTokenizer: KeywordTokenizer;
  private seed: SeedData;

  constructor(seed: SeedData) {
    this.seed = seed;
    this.keywordTokenizer = new KeywordTokenizer(seed.TOKENS);
  }

  parse(message: string, category = 'GRM_BANK'): MalanaResult {
    // Step 1: Tokenize
    const regexToks = regexTokenize(message);
    const kwToks = this.keywordTokenizer.tokenize(message);
    const allTokens = mergeTokens(regexToks, kwToks, message);

    // Step 2: Compile grammar layers for category
    const layers = compileSeed(this.seed, category);

    // Step 3: Run grammar passes
    const processed = runGrammar(allTokens, layers);

    // Step 4: Extract result tags
    const tags: Record<string, string> = {};
    let detectedCategory: string | null = null;

    for (const token of processed) {
      if (!token.matched) continue;
      const tag = token.values['_tag'];
      if (tag) {
        tags[tag] = token.values['amount'] || token.raw;
        if (!detectedCategory) detectedCategory = category;
      }
      // Preserve important structured values
      for (const [k, v] of Object.entries(token.values)) {
        if (!k.startsWith('_')) tags[k] = v;
      }
    }

    return { category: detectedCategory, tags, tokens: processed };
  }
}

export type { SeedData, MalanaResult };
