// Merchant/vendor name extraction, operating on the raw message string
// instead of the token stream.
//
// Why raw text: a merchant name is open-vocabulary free text (any business
// name), unlike currency codes, dates, or transaction verbs, which are a
// closed, enumerable vocabulary the keyword/regex tokenizers can recognize.
// Confirmed directly by tracing a real message through the engine — the
// merchant word never became a token at all (neither tokenizer recognized
// it as anything), so pattern-extractor.ts's #vendor capture, however well
// tuned, structurally cannot recover text that was never tokenized. See
// merchant-patterns.json for the evidence-backed anchors this reads.
//
// Two extraction paths, one shared validation gate:
//   extractRawMerchant   — anchor-based, matches this file's JSON patterns
//   extractLegacyMerchant — validates the existing token-based #vendor/
//                           #billvendor/#merchant capture as a fallback
// Neither path is trusted on its own; isValidMerchantCandidate is the single
// gate both go through before a name is ever shown.

import merchantPatternsRaw from "./data/merchant-patterns.json";
import { regexTokenize } from "./regex-tokenizer.js";

interface AnchorRule {
  id: string;
  before: string;
  after: string;
}

interface CompiledAnchor {
  id: string;
  regex: RegExp;
}

// Bounded capture ({1,80}) so an anchor can never swallow the rest of a long
// message; the after-anchor is a lookahead so the delimiter itself never
// becomes part of the candidate.
function compileAnchors(rules: AnchorRule[]): CompiledAnchor[] {
  return rules.map((rule) => {
    const pattern = `(?:${rule.before})([\\s\\S]{1,80}?)(?=${rule.after})`;
    try {
      return { id: rule.id, regex: new RegExp(pattern, "i") };
    } catch (err) {
      throw new Error(`merchant-patterns.json: invalid anchor "${rule.id}": ${String(err)}`);
    }
  });
}

// Compiled eagerly (not lazily) so a malformed anchor fails at import time,
// not silently on first use.
const compiledAnchors = compileAnchors(merchantPatternsRaw as AnchorRule[]);

function normalizeMerchantCandidate(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s.,;:!?'"()-]+/, "")
    .replace(/[\s.,;:!?'"()-]+$/, "");
}

// Token types that mean "this candidate IS a date/amount/number", reusing
// the tokenizers' own recognition instead of duplicating date/amount regexes
// here. Only rejects when a single token covers essentially the whole
// candidate — a partial match (e.g. "1234" inside "MCDONALDS-1234") must not
// disqualify a real merchant name that happens to contain digits.
const STRUCTURED_REJECT_TYPES = new Set(["DATE", "AMT", "NUM", "PCT", "USSD"]);

function isEntirelyStructured(candidate: string): boolean {
  const tokens = regexTokenize(candidate);
  if (tokens.length !== 1) return false;
  const [tok] = tokens;
  if (!tok || !STRUCTURED_REJECT_TYPES.has(tok.type)) return false;
  return tok.raw.trim().length >= candidate.length * 0.9;
}

// Ported verbatim from Cashiro's BankParser.commonWords (confirmed via
// direct source inspection: app/.../core/Constants.kt +
// BankParser.kt's isValidMerchantName) — deliberately NOT a hand-guessed
// salutation list ("dear"/"hello"/...). Cashiro doesn't need one: its
// raw-text anchors are tight enough that a salutation never falls inside
// the captured span to begin with. Ours has the same protection now that
// pattern-extractor.ts's structural stop-list excludes SAL-typed tokens
// (see that file) — a salutation is kept out of the capture at the source,
// not filtered after the fact with an invented word list.
const EXACT_STRUCTURAL_WORDS = new Set([
  "using",
  "via",
  "through",
  "by",
  "with",
  "for",
  "to",
  "from",
  "at",
  "the",
]);

// Confirmed from a real garbled label ("avoid as per T&C Ignore" — see
// task #7). Deliberately a short, evidence-backed list, not a guess at every
// possible disclaimer phrasing — extend only when a real example demands it.
const BOILERPLATE_SUBSTRINGS = ["avoid as per t&c"];

const MASKED_ACCOUNT_RE = /^[x*]{1,6}\d{2,}$/i;
const PURE_NUMBER_RE = /^\d+([.,]\d+)?$/;
// Ported from Cashiro's Constants.Parsing.MIN_MERCHANT_NAME_LENGTH = 2.
const MIN_MERCHANT_NAME_LENGTH = 2;

// Rejection gate, not a positive "looks like a name" check. Real merchant
// names are too irregular for positive heuristics (title case, word count,
// alphabetic majority) to survive — "7-Eleven", "1mg", "H&M", "99acres",
// "MCDONALDS-1234" would all fail those. Only reject when a candidate is
// definitely not a name.
export function isValidMerchantCandidate(candidate: string): boolean {
  if (candidate.length < MIN_MERCHANT_NAME_LENGTH) return false;
  if (!/[a-zA-Z0-9]/.test(candidate)) return false; // punctuation/noise only

  const lower = candidate.toLowerCase();
  if (EXACT_STRUCTURAL_WORDS.has(lower)) return false;
  if (BOILERPLATE_SUBSTRINGS.some((phrase) => lower.includes(phrase))) return false;

  if (candidate.includes("@")) return false; // VPA, e.g. "foo@oksbi"
  if (PURE_NUMBER_RE.test(candidate)) return false;
  if (MASKED_ACCOUNT_RE.test(candidate)) return false;
  if (isEntirelyStructured(candidate)) return false; // date / amount / number

  return true;
}

// Try anchors in file order (specific to generic — see merchant-patterns.json)
// and return the first candidate that survives validation. No scoring/
// ranking: with only one evidence-backed anchor so far, priority-by-order is
// sufficient and easier to reason about than a confidence score with no real
// conflicting cases to calibrate against yet.
export function extractRawMerchant(message: string): string | null {
  for (const anchor of compiledAnchors) {
    const match = anchor.regex.exec(message);
    const raw = match?.[1];
    if (!raw) continue;
    const candidate = normalizeMerchantCandidate(raw);
    if (isValidMerchantCandidate(candidate)) return candidate;
  }
  return null;
}

// Validates the existing token-based #vendor/#billvendor/#merchant capture
// through the same gate the raw-anchor path uses, so a candidate's origin
// never determines how strictly it's checked.
export function extractLegacyMerchant(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  const normalized = normalizeMerchantCandidate(candidate);
  return isValidMerchantCandidate(normalized) ? normalized : null;
}
