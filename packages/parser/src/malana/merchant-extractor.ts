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
// ---------------------------------------------------------------------------
// PORT PROVENANCE
// ---------------------------------------------------------------------------
// The generic anchors, the cleaning pipeline, and the core validator below
// are a line-by-line port of the reference app "Cashiro" (Kotlin), read
// directly from a local clone at the time of writing — not from a summary.
// Exact source locations:
//
//   CompiledPatterns.kt (object Merchant, lines 42-51):
//     TO_PATTERN   = to\s+([^\.\n]+?)(?:\s+on|\s+at|\s+Ref|\s+UPI)      /i
//     FROM_PATTERN = from\s+([^\.\n]+?)(?:\s+on|\s+at|\s+Ref|\s+UPI)    /i
//     AT_PATTERN   = at\s+([^\.\n]+?)(?:\s+on|\s+Ref)                  /i
//     FOR_PATTERN  = for\s+([^\.\n]+?)(?:\s+on|\s+at|\s+Ref)           /i
//     ALL_PATTERNS = listOf(TO_PATTERN, FROM_PATTERN, AT_PATTERN, FOR_PATTERN)
//   -> ported into merchant-patterns.json as cashiro_to/from/at/for, in the
//      same order (order matters: BankParser.extractMerchant tries them in
//      ALL_PATTERNS order and returns the first anchor whose match survives
//      cleaning + validation, falling through to the next PATTERN — not the
//      next match of the same pattern — on failure). None of these four
//      anchors use a \b word boundary before to/from/at/for in the Kotlin
//      source, so a match can start mid-word (e.g. "...photo Ref..." would
//      match "to Ref..." starting inside "photo"); that quirk is inherited
//      here unchanged rather than "fixed", since this is a port, not a
//      redesign.
//
//   CompiledPatterns.kt (object Cleaning, lines 106-116) + BankParser.kt
//   cleanMerchantName() (lines 525-536):
//     8 ordered regex replacements (the task brief said "six" — the actual
//     source has eight; ported all eight, not six):
//       1. TRAILING_PARENTHESES = \s*\(.*?\)\s*$              (no flags)
//       2. REF_NUMBER_SUFFIX    = \s+Ref\s+No.*                /i
//       3. DATE_SUFFIX          = \s+on\s+\d{2}.*               (no /i — "on"
//                                  must be literal lowercase; inherited as-is)
//       4. UPI_SUFFIX           = \s+UPI.*                      /i
//       5. TIME_SUFFIX          = \s+at\s+\d{2}:\d{2}.*         (no /i — "at"
//                                  must be literal lowercase; inherited as-is)
//       6. TRAILING_DASH        = \s*-\s*$                      (no flags)
//       7. PVT_LTD              = (\s+PVT\.?\s*LTD\.?|\s+PRIVATE\s+LIMITED)$ /i
//       8. LTD                  = (\s+LTD\.?|\s+LIMITED)$       /i
//     followed by .trim() — ported below as cleanMerchantName().
//
//   BankParser.kt isValidMerchantName() (lines 541-550) + Constants.kt
//   MIN_MERCHANT_NAME_LENGTH (line 5, value 2):
//     length >= 2 && name.any { it.isLetter() } && uppercase(name) not in
//     commonWords && !name.all { it.isDigit() } && !name.contains("@")
//     commonWords = {USING, VIA, THROUGH, BY, WITH, FOR, TO, FROM, AT, THE}
//   -> ported below as isValidMerchantName(). Note "any letter", not "any
//      alphanumeric" — a no-letter string like "12-34" has no letters and
//      must be rejected even though it isn't purely digits; Kotlin's
//      isLetter()/isDigit() are Unicode-aware, approximated here with the
//      \p{L}/\p{Nd} Unicode property escapes rather than ASCII [a-zA-Z0-9].
//
// The old single "trf to X Refno" anchor from the first pass has been
// DROPPED. Verified by tracing the confirmed real example through the
// Cashiro TO_PATTERN directly: in
//   "...on date 15Aug26 trf to shopname Refno 123456789012"
// TO_PATTERN's "to\s+" matches the "to" in "trf to", the non-greedy capture
// "([^.\n]+?)" takes "shopname", and the lookahead alternative "\s+Ref"
// matches the space before "Refno" (Ref is a prefix of Refno, so the
// alternative only needs to match the "Ref" substring, not the whole word)
// — giving the same "shopname" result the old bespoke anchor gave, with no
// dependency on the specific word "trf". Cashiro's own anchor is strictly
// broader (any "to X" before on/at/Ref/UPI, not just "trf to X Ref[no]"), so
// the old anchor was redundant for this case and for every case it could
// match. Keeping both would only add risk of the narrower one firing first
// with a worse (less-cleaned) result, so it was removed rather than kept
// alongside.
//
// ---------------------------------------------------------------------------
// Two extraction paths, one shared validation gate:
//   extractRawMerchant   — anchor-based, matches this file's JSON patterns
//   extractLegacyMerchant — validates the existing token-based #vendor/
//                           #billvendor/#merchant capture as a fallback
// Neither path is trusted on its own; isValidMerchantCandidate is the single
// gate both go through before a name is ever shown. isValidMerchantCandidate
// wraps the faithfully-ported isValidMerchantName with a few additional,
// evidence-backed guards that are NOT present in Cashiro's source (masked
// account numbers, a confirmed real boilerplate phrase, decimal amounts,
// tokenizer-recognized structured values). Those extra guards predate this
// port and are called out explicitly below so they are never mistaken for
// ported Cashiro logic.

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

// Capture shape ported from Cashiro's own anchors: [^.\n]+? (non-greedy, any
// char except period/newline). Cashiro's capture is otherwise unbounded,
// relying entirely on the lookahead terminator to stop it; we additionally
// cap it at 300 chars so a message with no terminator at all (e.g. an anchor
// word with no "on/at/Ref/UPI" anywhere after it) can never swallow the rest
// of a very long message. This bound is a safety net not present in the
// Kotlin source, not a semantic difference for any message the terminator
// actually appears in.
const CAPTURE_MAX = 300;

function compileAnchors(rules: AnchorRule[]): CompiledAnchor[] {
  return rules.map((rule) => {
    const pattern = `(?:${rule.before})([^.\\n]{1,${CAPTURE_MAX}}?)(?=${rule.after})`;
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

// ---------------------------------------------------------------------------
// Faithful port of Cashiro's CompiledPatterns.Cleaning + BankParser.cleanMerchantName
// (see provenance comment above for exact source lines). Order preserved.
// ---------------------------------------------------------------------------
const TRAILING_PARENTHESES = /\s*\(.*?\)\s*$/;
const REF_NUMBER_SUFFIX = /\s+Ref\s+No.*/i;
const DATE_SUFFIX = /\s+on\s+\d{2}.*/; // no /i in source — literal lowercase "on"
const UPI_SUFFIX = /\s+UPI.*/i;
const TIME_SUFFIX = /\s+at\s+\d{2}:\d{2}.*/; // no /i in source — literal lowercase "at"
const TRAILING_DASH = /\s*-\s*$/;
const PVT_LTD = /(\s+PVT\.?\s*LTD\.?|\s+PRIVATE\s+LIMITED)$/i;
const LTD = /(\s+LTD\.?|\s+LIMITED)$/i;

function cleanMerchantName(merchant: string): string {
  return merchant
    .replace(TRAILING_PARENTHESES, "")
    .replace(REF_NUMBER_SUFFIX, "")
    .replace(DATE_SUFFIX, "")
    .replace(UPI_SUFFIX, "")
    .replace(TIME_SUFFIX, "")
    .replace(TRAILING_DASH, "")
    .replace(PVT_LTD, "")
    .replace(LTD, "")
    .trim();
}

// Extra whitespace/punctuation trim layered on top of Cashiro's own
// cleanMerchantName (not part of the port) — collapses internal whitespace
// and strips leading/trailing punctuation that Cashiro's narrower
// TRAILING_PARENTHESES/TRAILING_DASH rules don't cover.
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
// NOT part of the Cashiro port — an app-specific guard.
const STRUCTURED_REJECT_TYPES = new Set(["DATE", "AMT", "NUM", "PCT", "USSD"]);

function isEntirelyStructured(candidate: string): boolean {
  const tokens = regexTokenize(candidate);
  if (tokens.length !== 1) return false;
  const [tok] = tokens;
  if (!tok || !STRUCTURED_REJECT_TYPES.has(tok.type)) return false;
  return tok.raw.trim().length >= candidate.length * 0.9;
}

// Ported verbatim from Cashiro's BankParser.isValidMerchantName commonWords
// set (BankParser.kt line 543) and Constants.Parsing.MIN_MERCHANT_NAME_LENGTH
// (Constants.kt line 5, value 2). See the provenance comment at the top of
// this file for exact source excerpts.
const COMMON_WORDS = new Set([
  "USING",
  "VIA",
  "THROUGH",
  "BY",
  "WITH",
  "FOR",
  "TO",
  "FROM",
  "AT",
  "THE",
]);
const MIN_MERCHANT_NAME_LENGTH = 2;

// Faithful port of BankParser.kt isValidMerchantName (lines 541-550):
//   name.length >= MIN_MERCHANT_NAME_LENGTH &&
//   name.any { it.isLetter() } &&
//   name.uppercase() !in commonWords &&
//   !name.all { it.isDigit() } &&
//   !name.contains("@")
// Divergence: Kotlin's isLetter()/isDigit() are Unicode-aware; approximated
// here with the \p{L} / \p{Nd} Unicode property escapes (JS has no direct
// isLetter()/isDigit() equivalent) rather than ASCII-only [a-zA-Z]/[0-9].
function isValidMerchantName(name: string): boolean {
  return (
    name.length >= MIN_MERCHANT_NAME_LENGTH &&
    /\p{L}/u.test(name) &&
    !COMMON_WORDS.has(name.toUpperCase()) &&
    !/^\p{Nd}+$/u.test(name) &&
    !name.includes("@")
  );
}

// Confirmed from a real garbled label ("avoid as per T&C Ignore" — see
// task #7). Deliberately a short, evidence-backed list, not a guess at every
// possible disclaimer phrasing — extend only when a real example demands it.
// NOT part of the Cashiro port — an app-specific guard.
const BOILERPLATE_SUBSTRINGS = ["avoid as per t&c"];

// NOT part of the Cashiro port — app-specific guards for shapes Cashiro's
// own validator doesn't need to reject (its raw-text anchors and calling
// context differ from ours).
const MASKED_ACCOUNT_RE = /^[x*]{1,6}\d{2,}$/i;
const PURE_NUMBER_RE = /^\d+([.,]\d+)?$/; // catches decimals ("50.00"), which
// isValidMerchantName's integer-only all-digit check would miss (a decimal
// string has a "." so name.all{it.isDigit()} is already false in Kotlin too
// — kept here as an explicit, cheap belt-and-braces check).

// Rejection gate, not a positive "looks like a name" check. Real merchant
// names are too irregular for positive heuristics (title case, word count,
// alphabetic majority) to survive — "7-Eleven", "1mg", "H&M", "99acres",
// "MCDONALDS-1234" would all fail those. Only reject when a candidate is
// definitely not a name. Built on top of the faithfully-ported
// isValidMerchantName plus the app-specific extra guards documented above.
export function isValidMerchantCandidate(candidate: string): boolean {
  if (!isValidMerchantName(candidate)) return false;

  const lower = candidate.toLowerCase();
  if (BOILERPLATE_SUBSTRINGS.some((phrase) => lower.includes(phrase))) return false;

  if (PURE_NUMBER_RE.test(candidate)) return false;
  if (MASKED_ACCOUNT_RE.test(candidate)) return false;
  if (isEntirelyStructured(candidate)) return false; // date / amount / number

  return true;
}

// Try anchors in file order — Cashiro's own ALL_PATTERNS order: TO, FROM,
// AT, FOR (CompiledPatterns.kt line 50) — mirroring BankParser.extractMerchant
// (lines 307-318): for each anchor, take its first match only, clean it,
// validate it, and return on the first anchor whose result survives; an
// anchor whose match fails validation is abandoned entirely (no retry against
// a later occurrence of the same anchor in the message) and the loop moves to
// the next anchor.
export function extractRawMerchant(message: string): string | null {
  for (const anchor of compiledAnchors) {
    const match = anchor.regex.exec(message);
    const raw = match?.[1];
    if (!raw) continue;
    const cleaned = cleanMerchantName(raw.trim());
    const candidate = normalizeMerchantCandidate(cleaned);
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
