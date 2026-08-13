import type { Token, SeedData, MalanaResult } from './types';
import { regexTokenize } from './regex-tokenizer';
import { KeywordTokenizer } from './keyword-tokenizer';
import { compileSeed } from './grammar-compiler';
import { runGrammar } from './grammar-runner';
import { detectBank, detectMerchantCategory, detectSubcategory } from './enrichment';

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

// Choose the best representative value for a given tag type.
// Tag names come from GRMR result entries like INTENT[trx], INSTR[acc], BAL[bal].
function pickTagValue(tag: string, values: Record<string, string>): string {
  switch (tag) {
    case 'trx':
    case 'bal':
    case 'waladd':
    case 'walsub':
    case 'crdlmt':
    case 'totcrdlmt':
    case 'incrdlmt':
    case 'chqamt':
    case 'subsidy':
      return values['amount'] || '';
    case 'acc':
    case 'beneacc':
      return values['instrno'] || values['idval'] || '';
    case 'ref':
      return values['instrno'] || values['idval'] || '';
    case 'trxcatg':
    case 'bene':
    case 'beneadd':
      return values['idval'] || '';
    default:
      return values['amount'] || values['instrno'] || values['idval'] || '';
  }
}

export class MalanaEngine {
  private keywordTokenizer: KeywordTokenizer;
  private seed: SeedData;

  constructor(seed: SeedData) {
    this.seed = seed;
    this.keywordTokenizer = new KeywordTokenizer(seed.TOKENS);
  }

  parse(message: string, sender = '', category = 'GRM_BANK'): MalanaResult {
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
        // Pick the most meaningful value for this tag type
        const tagValue = pickTagValue(tag, token.values);
        if (tagValue) tags[tag] = tagValue;
        if (!detectedCategory) detectedCategory = category;
      }
      // Propagate all non-internal structured values as top-level tags.
      // For 'amount': only update if we don't already have a transaction-tagged amount
      // (prevents balance AMT from overwriting transaction AMT when both appear).
      for (const [k, v] of Object.entries(token.values)) {
        if (k.startsWith('_') || !v) continue;
        if (k === 'amount' && tags['trx']) continue; // trx tag already locked in the amount
        if ((k === 'acc' || k === 'instrno') && tags[k]) continue; // keep first account seen
        tags[k] = v;
      }
    }

    // ── Fallbacks for common Indian bank SMS patterns not covered by grammar ──

    // 1. Type direction from unmatched TRX/TRANS tokens (e.g. "debited FOR Rs.X" where
    //    PREPV between TRX and AMT prevents the grammar TRX-AMT pair from firing).
    if (!tags['type']) {
      for (const token of processed) {
        if (token.matched) continue;
        const t = token.values['type'] || token.values['_norm'];
        if (t === 'debit' || t === 'credit') {
          tags['type'] = t;
          if (!detectedCategory) detectedCategory = category;
          break;
        }
      }
    }

    // 2. INCRDLMT spuriously fires from PREP+AMT pairs in Indian SMS like
    //    "Debited WITH Rs.5000" or "debited WITH Rs.649 towards Netflix".
    //    Prefer this over a stray unmatched AMT because it's closer to the TRX context.
    if (!tags['trx'] && tags['incrdlmt'] && tags['type']) {
      tags['trx'] = tags['incrdlmt'];
      if (!detectedCategory) detectedCategory = category;
    }

    // 3. Transaction amount from first unmatched AMT (when direction is now known but
    //    no INTENT fired and no incrdlmt — the AMT wasn't adjacent to the TRX token).
    if (!tags['trx'] && tags['type']) {
      for (const token of processed) {
        if (!token.matched && token.type === 'AMT') {
          tags['trx'] = token.raw;
          if (!detectedCategory) detectedCategory = category;
          break;
        }
      }
    }

    // 4. BAL token immediately before an unmatched TRX token holds the transaction
    //    amount, not the balance (pattern: "Rs.500 has been DEBITED" → AMT AUX → BAL,
    //    then TRX is left alone). Recover the amount from the BAL's child AMT.
    if (!tags['trx']) {
      for (let i = 0; i < processed.length - 1; i++) {
        const tok = processed[i]!;
        const nxt = processed[i + 1]!;
        if (tok.matched && tok.type === 'BAL' && !nxt.matched) {
          const dir = nxt.values['type'] || nxt.values['_norm'];
          if (dir === 'debit' || dir === 'credit') {
            const amt = tok.values['amount'];
            if (amt) {
              tags['trx'] = amt;
              if (!tags['type']) tags['type'] = dir;
              if (!detectedCategory) detectedCategory = category;
              break;
            }
          }
        }
      }
    }

    const merchant = tags['bene'] || tags['vendor'] || tags['merchant'] || '';
    return {
      category: detectedCategory,
      tags,
      tokens: processed,
      bankName: detectBank(sender, message),
      merchantCategory: detectMerchantCategory(merchant),
      subcategory: detectSubcategory(tags),
    };
  }
}

export type { SeedData, MalanaResult };
