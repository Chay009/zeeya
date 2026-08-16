// ═══════════════════════════════════════════════════════════════════════════
// Truecaller vendor-category fuzzy matcher — reverse-engineered port
// ═══════════════════════════════════════════════════════════════════════════
//
// This is a byte-faithful TypeScript port of the ACTUAL vendor/bank/brand
// category-matching engine shipped inside the Truecaller Android app. It was
// not guessed or inferred from the JSON shape — it was recovered by
// disassembling the real APK (`classes.dex`..`classes9.dex`, decoded with
// `apktool` to smali) and hand-tracing the bytecode call graph:
//
//   Lht1/c   — asset cache: loads vendorSeed/vendor_{metadata,seed,banks,
//              brands,operators}.json as raw strings
//   Lf2/y    — constructs the matcher from those JSON files and owns the
//              actual match method, `i(String): Map` (renamed `matchVendor`
//              below). This is the entry point everything here reproduces.
//   Lwi/v    — flattens vendor_seed.json / vendor_banks.json (category ->
//              [keyword,...]) into keyword -> [category,...] maps via a
//              helper `w()` (renamed `buildTagMap` below), and flattens
//              vendor_brands.json (brand -> {tokens, tags}) into a
//              token -> [brand,...] map plus a brand -> [tag,...] map.
//   Ljp2/qux — wraps a character trie (class `Laa3/bar`, root char '*')
//              built from every entry in vendor_operators.json, and
//              implements the actual merchant-string tokenizer that walks
//              that trie char-by-char (`i()`'s tokenizing loop, reproduced
//              in `tokenizeByOperators` below).
//   `j(ArrayList, HashMap): HashSet` (static helper on Lf2/y) — the fuzzy
//              tag lookup: an exact/substring shortcut for longer keywords,
//              falling back to a textbook Jaro-Winkler similarity search
//              over every keyword in the map, with a final acceptance gate
//              that differs for short (<=4 char) vs long tokens. Reproduced
//              below as `fuzzyMatchTags`.
//
// Full credit for the algorithm itself belongs to Truecaller/Twelfthmile's
// Malana team — nothing here is a new design, it is a direct translation of
// their compiled bytecode into readable TypeScript, with every control-flow
// branch and the Jaro-Winkler formula preserved exactly as found.
// ═══════════════════════════════════════════════════════════════════════════

import vendorSeedRaw from "./data/vendor_seed.json";
import vendorBanksRaw from "./data/vendor_banks.json";
import vendorBrandsRaw from "./data/vendor_brands.json";
import vendorOperatorsRaw from "./data/vendor_operators.json";

// ── Laa3/bar — operator trie node ──────────────────────────────────────────
// Root node holds char '*' (0x2a), matching the real constructor
// `new Laa3.bar('*')`. Each inserted operator string walks/creates one child
// per character; the terminal node of a full operator gets `isEnd = true`.
//
// Children are keyed by char in a Map rather than the ArrayList the original
// bytecode uses — that's an implementation detail of Java's `Laa3.bar`, not
// part of the ported control flow, and a Map turns every child lookup below
// (multiple per character of every merchant string tokenized) from a linear
// scan into O(1).
interface TrieNode {
  char: string;
  children: Map<string, TrieNode>;
  isEnd: boolean;
}

function newTrieNode(char: string): TrieNode {
  return { char, children: new Map(), isEnd: false };
}

function buildOperatorTrie(operators: string[]): TrieNode {
  const root = newTrieNode("*");
  for (const op of operators) {
    let node = root;
    for (const ch of op) {
      let next = node.children.get(ch);
      if (!next) {
        next = newTrieNode(ch);
        node.children.set(ch, next);
      }
      node = next;
    }
    node.isEnd = true;
  }
  return root;
}

// `Ljp2/qux.g(Laa3/bar, Character): Laa3/bar` — descend into a child by char.
// Real bytecode only calls this after confirming containment (the `f().
// contains(c)` check the caller does inline via `node.children.has(c)`), so
// a missing child means the trie was built or walked inconsistently — that's
// an invariant violation worth failing loudly on rather than silently
// returning the wrong node and mis-tokenizing.
function descend(node: TrieNode, ch: string): TrieNode {
  const next = node.children.get(ch);
  if (!next) {
    throw new Error(
      `vendor-category-matcher: operator trie has no child '${ch}' from node '${node.char}'`,
    );
  }
  return next;
}

const OPERATOR_TRIE = buildOperatorTrie((vendorOperatorsRaw as string[]).filter(Boolean));

// ── `Lf2/y.i`'s tokenizing loop ────────────────────────────────────────────
// Walks the lowercased merchant string character by character against the
// operator trie. Whenever the walk lands on a node with no further children
// AND that node is a valid operator terminus, the operator is "consumed" as
// a separator (discarded) and whatever text was accumulated before it is
// flushed as a word. If a trie walk breaks off WITHOUT ever reaching a valid
// terminus, the buffered characters are not a real operator — they're folded
// back into the current word as literal text (this is exactly why an
// isolated "-" or "/" splits a merchant string, but a partial/almost-operator
// sequence doesn't wrongly eat real characters).
//
// The resulting words are then further split on a literal space, mirroring
// the original method's final `word.split(" ")` flatten step.
export function tokenizeByOperators(rawText: string): string[] {
  const text = rawText.toLowerCase();
  const words: string[] = [];
  let currentWord = "";
  let operatorBuf = "";
  let node = OPERATOR_TRIE;
  let inOperatorMatch = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;

    if (node.children.size === 0 && node.isEnd) {
      // Operator fully matched with no further extension possible — consume
      // it as a separator and flush the word accumulated before it.
      if (currentWord.length > 0) words.push(currentWord);
      currentWord = "";
      operatorBuf = "";

      if (OPERATOR_TRIE.children.has(c)) {
        operatorBuf = c;
        node = descend(OPERATOR_TRIE, c);
      } else {
        currentWord += c;
        node = OPERATOR_TRIE;
        inOperatorMatch = false;
      }
      continue;
    }

    if (node.children.has(c)) {
      // Continue walking down the trie.
      node = descend(node, c);
      operatorBuf += c;
      inOperatorMatch = true;
      continue;
    }

    // `c` does not continue the current trie walk.
    if (!inOperatorMatch) {
      currentWord += c;
      continue;
    }

    if (node.isEnd) {
      // The walk so far WAS a complete, valid operator — commit the word
      // that preceded it; the operator itself is discarded (separator).
      if (currentWord.length > 0) words.push(currentWord);
      currentWord = "";
    } else {
      // The walk broke before reaching a valid operator — not a real
      // separator, fold the buffered characters back in as literal text.
      currentWord += operatorBuf;
    }
    operatorBuf = "";

    if (OPERATOR_TRIE.children.has(c)) {
      operatorBuf = c;
      node = descend(OPERATOR_TRIE, c);
    } else {
      currentWord += c;
      node = OPERATOR_TRIE;
    }
  }

  // Flush whatever remains after the loop.
  if (currentWord.length > 0) {
    words.push(node.isEnd ? currentWord : currentWord + operatorBuf);
  }

  const tokens: string[] = [];
  for (const w of words) tokens.push(...w.split(" "));
  return tokens.filter(Boolean);
}

// ── `Lwi/v.w` — flatten a category/bank JSON into keyword -> [name,...] ────
// Note this deliberately allows ONE keyword to map to MULTIPLE names (e.g.
// "car" legitimately appears under both "automobile" and "travel" in
// vendor_seed.json) — the original HashMap<String, List<String>> appends,
// it never overwrites.
export function buildTagMap(source: Record<string, string[]>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [name, keywords] of Object.entries(source)) {
    for (const kw of keywords) {
      const list = map.get(kw) ?? [];
      list.push(name);
      map.set(kw, list);
    }
  }
  return map;
}

// ── Jaro similarity + Winkler prefix bonus ──────────────────────────────────
// Textbook Jaro-Winkler, reproduced from the matching bytecode: a bounded
// sliding-window match count, a transposition count over the matched
// characters in order, combined via the classic 3-term average, with the
// Winkler common-prefix bonus (scale 0.1, capped at 4 chars) applied ONLY
// when the raw Jaro score already clears 0.7 — note the 0.7 gate controls
// the bonus, not acceptance; the actual accept/reject decision happens later
// in `fuzzyMatchTags`.
function jaroWinkler(a: string, b: string): number {
  const len1 = a.length;
  const len2 = b.length;
  if (len1 === 0 || len2 === 0) return 0;

  const matchWindow = Math.max(Math.floor(Math.max(len1, len2) / 2) - 1, 0);
  const aMatched = Array.from({ length: len1 }, () => false);
  const bMatched = Array.from({ length: len2 }, () => false);
  let matches = 0;

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, len2);
    for (let j = start; j < end; j++) {
      if (bMatched[j] || a[i] !== b[j]) continue;
      aMatched[i] = true;
      bMatched[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  const aMatchedChars = a.split("").filter((_, i) => aMatched[i]);
  const bMatchedChars = b.split("").filter((_, i) => bMatched[i]);
  let diffs = 0;
  for (let i = 0; i < matches; i++) {
    if (aMatchedChars[i] !== bMatchedChars[i]) diffs++;
  }

  const jaro = (matches / len1 + matches / len2 + (matches - diffs / 2) / matches) / 3;
  if (jaro < 0.7) return jaro;

  const maxPrefix = Math.min(4, len1, len2);
  let prefixLen = 0;
  while (prefixLen < maxPrefix && a[prefixLen] === b[prefixLen]) prefixLen++;

  return jaro + prefixLen * 0.1 * (1 - jaro);
}

// ── longest common (contiguous) substring length ────────────────────────────
// Classic diagonal-reset DP: dp[i][j] = dp[i-1][j-1]+1 on a char match, else
// 0; track the running max. Used only for the short-token (<=4 char)
// acceptance path.
//
// Only the previous row is ever read, so this keeps a single rolling row
// instead of a full 2D table — same result, less memory, and (with
// noUncheckedIndexedAccess on) no non-null assertions needed to read it.
function longestCommonSubstringLength(a: string, b: string): number {
  let prevRow = Array.from({ length: b.length + 1 }, () => 0);
  let max = 0;
  for (let i = 1; i <= a.length; i++) {
    const currRow = Array.from({ length: b.length + 1 }, () => 0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        const val = (prevRow[j - 1] ?? 0) + 1;
        currRow[j] = val;
        if (val > max) max = val;
      }
    }
    prevRow = currRow;
  }
  return max;
}

// ── `Lf2/y.j` — the fuzzy tag lookup ────────────────────────────────────────
// For every token: keywords longer than 3 chars that literally appear as a
// substring of the token are accepted outright (this is deliberately gated
// to keywords > 3 chars — it's why short generic keywords like "car"/"bar"/
// "fun"/"oil" do NOT hit this path and cause the "flipkart"/"fund"/"baroda"
// substring false-positives a naive port would produce). Independently, the
// single best Jaro-Winkler match across all keywords is tracked; it's
// accepted if the token is >4 chars and the score exceeds 0.9, or — for
// tokens <=4 chars — if the longest common substring against the best
// keyword covers almost the entire (shorter) keyword.
export function fuzzyMatchTags(tokens: string[], tagMap: Map<string, string[]>): Set<string> {
  const result = new Set<string>();
  const keys = [...tagMap.keys()];

  for (const token of tokens) {
    const localTags = new Set<string>();
    let bestKeyword = "";
    let bestScore = 0;

    for (const keyword of keys) {
      const score = jaroWinkler(token, keyword);
      if (score >= bestScore) {
        bestScore = score;
        bestKeyword = keyword;
      }
      if (keyword.length > 3 && token.includes(keyword)) {
        for (const tag of tagMap.get(keyword) ?? []) localTags.add(tag);
      }
    }

    if (token.length > 4) {
      if (bestScore > 0.9) {
        for (const tag of tagMap.get(bestKeyword) ?? []) localTags.add(tag);
      }
    } else {
      const lcsLen = longestCommonSubstringLength(bestKeyword, token);
      const threshold = bestKeyword.length > 4 ? bestKeyword.length - 1 : bestKeyword.length;
      if (lcsLen >= threshold && lcsLen > 0) {
        for (const tag of tagMap.get(bestKeyword) ?? []) localTags.add(tag);
      }
    }

    for (const tag of localTags) result.add(tag);
  }

  return result;
}

// ── `Lwi/v` construction from vendor_seed / vendor_banks / vendor_brands ───
const CATEGORY_TAG_MAP = buildTagMap(vendorSeedRaw as Record<string, string[]>);
const BANK_TAG_MAP = buildTagMap(vendorBanksRaw as Record<string, string[]>);

interface BrandEntry {
  tokens: string[];
  tags: string[];
}
const brandsRaw = vendorBrandsRaw as Record<string, BrandEntry>;
const BRAND_TOKEN_MAP = new Map<string, string[]>();
const BRAND_TAGS: Record<string, string[]> = {};
for (const [brand, entry] of Object.entries(brandsRaw)) {
  BRAND_TAGS[brand] = entry.tags ?? [];
  for (const tok of entry.tokens ?? []) {
    const list = BRAND_TOKEN_MAP.get(tok) ?? [];
    list.push(brand);
    BRAND_TOKEN_MAP.set(tok, list);
  }
}

export interface VendorMatch {
  tags: string[];
  banks: string[];
  brands: string[];
}

// ── `Lf2/y.i` — the full entry point ────────────────────────────────────────
// Tokenize the merchant string on operators, fuzzy-match against categories,
// banks, and brands, then fold each matched brand's own extra tags in too
// (e.g. matching brand "google" also contributes its "payments"/"online"
// tags from vendor_brands.json).
//
// `banks` is computed lazily (only on first access) since the fuzzy match is
// an O(tokens x keywords) Jaro-Winkler + longest-common-substring pass —
// `tags` and `brands` are always needed together (brand tags fold into
// `tags`), but most callers (e.g. detectMerchantCategory) only ever read
// `tags`, so paying for a bank-name fuzzy match on every call is wasted work
// on this per-message hot path.
export function matchVendor(merchantText: string): VendorMatch {
  if (!merchantText) return { tags: [], banks: [], brands: [] };

  const tokens = tokenizeByOperators(merchantText);
  const tags = fuzzyMatchTags(tokens, CATEGORY_TAG_MAP);
  const brands = fuzzyMatchTags(tokens, BRAND_TOKEN_MAP);

  for (const brand of brands) {
    for (const tag of BRAND_TAGS[brand] ?? []) tags.add(tag);
  }

  let cachedBanks: string[] | null = null;
  return {
    tags: [...tags],
    brands: [...brands],
    get banks(): string[] {
      if (cachedBanks === null) cachedBanks = [...fuzzyMatchTags(tokens, BANK_TAG_MAP)];
      return cachedBanks;
    },
  };
}
