// Bank name detection, merchant category, brand enrichment, subcategory derivation.
// All data loaded from the original Truecaller APK JSON assets.

import type { Token } from './types';
import vendorBanksRaw     from './data/vendor_banks.json';
import vendorBrandsRaw    from './data/vendor_brands.json';
import bankSeedRaw     from './data/bank.json';       // malanaSeed — 32 banks, complete sender IDs
import addrSeedRaw     from './data/addr.json';       // malanaSeed — 424 sender IDs → grammar category
import upiSeedRaw      from './data/upi.json';        // malanaSeed — 111 UPI handles
import categorizerRaw  from './data/categorizer.json'; // Naive Bayes binary classifier (3708 words)
import airportSeedRaw  from './data/airport.json';    // malanaSeed — 101 Indian/regional city → IATA code
import locationSeedRaw from './data/location.json';   // malanaSeed — 4,829-place Indian gazetteer
import offersSeedRaw   from './data/offers.json';      // malanaSeed — 251 promo sender-codes → 8 categories
import { matchVendor } from './vendor-category-matcher';

// ── Sender → grammar category (addr.json) ─────────────────────────────────────
// "GRM_BANK" → ["ICICIB", "HDFCBK", ...]
// Inverted to senderFragment → grammar for fast lookup.
// Priority order: GRM_BANK > GRM_TRAVEL > GRM_DELIVERY > GRM_OFFERS > GRM_EVENT > GRM_BILL > others
// Many bank senders appear in both GRM_BANK and GRM_BILL; GRM_BANK must win.
const GRAMMAR_PRIORITY: Record<string, number> = {
  GRM_BANK: 100, GRM_TRAVEL: 80, GRM_DELIVERY: 70,
  GRM_OFFERS: 60, GRM_EVENT: 50, GRM_BILL: 40,
};
const SENDER_GRAMMAR_MAP = new Map<string, string>();
for (const [grammar, senders] of Object.entries(addrSeedRaw as Record<string, string[]>)) {
  const newPri = GRAMMAR_PRIORITY[grammar] ?? 0;
  for (const s of senders) {
    const key = s.toLowerCase();
    const existing = SENDER_GRAMMAR_MAP.get(key);
    const existingPri = existing ? (GRAMMAR_PRIORITY[existing] ?? 0) : -1;
    if (newPri > existingPri) SENDER_GRAMMAR_MAP.set(key, grammar);
  }
}

// Returns the grammar category indicated by the sender ID, or null if unknown.
export function grammarForSender(sender: string): string | null {
  const s = sender.toLowerCase();
  // Real Indian SMS senders: "VM-HDFCBK", "AD-SBIINB" — check each fragment after stripping prefix
  const fragments = s.split(/[-_]/);
  for (const frag of fragments) {
    const g = SENDER_GRAMMAR_MAP.get(frag);
    if (g) return g;
  }
  // Also try the raw sender directly
  return SENDER_GRAMMAR_MAP.get(s) ?? null;
}

// ── Bank name ─────────────────────────────────────────────────────────────────

// bank.json (malanaSeed) — 32 banks, each with their real SMS sender fragments.
// Primary source: more complete than vendor_banks.json (13 banks).
const BANK_SEED: Array<[string, string[]]> = Object.entries(
  bankSeedRaw as Record<string, string[]>
);

// vendor_banks.json (vendorSeed) — covers a few extra UPI handles (okhdfc, okaxis, etc.)
// used as supplementary match layer. Its keys ("hdfc", "state bank of india", ...)
// are lowercase shorthand for the same real banks bank.json already names in full
// ("HDFC Bank", "State Bank of India"), so resolve through bank.json's own name list
// instead of hand-listing each bank again here — that list is the single source of
// truth and the only thing that needs updating when a new bank is added.
const BANK_SEED_NAMES: string[] = BANK_SEED.map(([name]) => name);

function toTitleCase(key: string): string {
  return key.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Resolves a vendor_banks.json key to bank.json's canonical name for the same
// bank, when one exists. Exact match first; then "key" as a leading word of a
// canonical name (never a plain substring — "bank of india" is a substring of
// "state bank of india" but they're two different real banks, so a bare
// `.includes()` would wrongly merge them). No bank.json match at all (e.g.
// "rbi", "idfc" — not present under any spelling) falls back to a plain
// title-cased version of the key.
function resolveBankName(key: string): string {
  const lower = key.toLowerCase();
  const exact = BANK_SEED_NAMES.find(name => name.toLowerCase() === lower);
  if (exact) return exact;
  const prefixMatches = BANK_SEED_NAMES.filter(name => name.toLowerCase().startsWith(lower + ' '));
  if (prefixMatches.length === 1) return prefixMatches[0]!;
  return toTitleCase(key);
}

const VENDOR_BANKS: Array<[string, string[]]> = Object.entries(
  vendorBanksRaw as Record<string, string[]>
).map(([name, patterns]) => [resolveBankName(name), patterns] as [string, string[]]);

// Message-body fallback for banks without sender-based detection.
const BODY_BANK_PATTERNS: Array<[RegExp, string]> = [
  [/bandhan/i,                 'Bandhan Bank'],
  [/equitas/i,                 'Equitas Small Finance Bank'],
  [/karnataka bank/i,          'Karnataka Bank'],
  [/au small finance|au bank/i,'AU Small Finance Bank'],
  [/uco bank/i,                'UCO Bank'],
  [/central bank/i,            'Central Bank of India'],
  [/punjab.*sind|sind.*bank/i, 'Punjab & Sind Bank'],
  [/airtel.*bank/i,            'Airtel Payments Bank'],
  [/jio.*bank/i,               'Jio Payments Bank'],
  [/saraswat/i,                'Saraswat Bank'],
  [/dbs bank/i,                'DBS Bank'],
  [/city union/i,              'City Union Bank'],
  [/nsdl/i,                    'NSDL Payments Bank'],
  [/jupiter/i,                 'Jupiter'],
  [/\bslice\b/i,               'Slice'],
  [/\bcred\b/i,                'CRED'],
];

export function detectBank(sender: string, message: string): string | null {
  const s = sender.toLowerCase();
  const fragments = s.split(/[-_\s]/);

  // Layer 1: bank.json exact sender fragment match (primary — 32 banks, complete sender lists)
  for (const [name, senders] of BANK_SEED) {
    if (senders.some(id => fragments.includes(id.toLowerCase()))) return name;
  }

  // Layer 2: vendor_banks.json substring match (covers UPI handles: okhdfc, okaxis, oksbi, etc.)
  for (const [name, patterns] of VENDOR_BANKS) {
    if (patterns.some(p => s.includes(p))) return name;
  }

  // Layer 3: message body keyword match
  const haystack = sender + ' ' + message;
  for (const [re, name] of BODY_BANK_PATTERNS) {
    if (re.test(haystack)) return name;
  }

  return null;
}

// ── UPI mandate lifecycle ──────────────────────────────────────────────────────
// Not part of the ported grammar (Truecaller's own engine doesn't track mandate
// lifecycle state at all — see regex-tokenizer.ts's MANDATEID token for why).
//
// Checked the real seed TOKENS dictionary directly rather than guess at wording:
// MANDATE ("mandate") and SUCCESSFUL ("successful|success") both exist as real
// keyword classes, but neither fires on real mandate SMS — "UPI-Mandate" doesn't
// match the plain "mandate" keyword due to the hyphen, and "successfully" doesn't
// stem to "successful"/"success". There is no real dictionary signal for a
// creation/execution event at all. RESCHE ("cancelled|cancel,rescheduled|...")
// does fire — it's the same generic cancel/reschedule keyword class the seed
// already reuses elsewhere (order/delivery cancellation), so cancellation is a
// real, data-driven signal; "created" vs "executed" is not, so those collapse
// into a single "active" state rather than inventing a distinction the
// dictionary doesn't support.
export function isMandateCancelled(kwToks: Token[]): boolean {
  return kwToks.some(t => t.type === 'RESCHE');
}

// ── UPI handle detection ───────────────────────────────────────────────────────

// upi.json: { handles: ["airtel", "axis", "paytm", ...] }
const UPI_HANDLES = new Set<string>(
  ((upiSeedRaw as { handles: string[] }).handles ?? []).map(h => h.toLowerCase())
);

// Extracts the UPI handle from a VPA like "user@airtel" → "airtel".
// Returns the handle name if it's a known UPI handle, else null.
export function detectUpiHandle(vpa: string): string | null {
  if (!vpa) return null;
  const atIdx = vpa.lastIndexOf('@');
  if (atIdx === -1) return null;
  const handle = vpa.slice(atIdx + 1).toLowerCase();
  return UPI_HANDLES.has(handle) ? handle : null;
}

// ── Merchant category ─────────────────────────────────────────────────────────
//
// Delegates to vendor-category-matcher.ts, a reverse-engineered port of
// Truecaller's real vendor/bank/brand fuzzy-matching engine (traced from the
// actual APK bytecode — see that file's header for the full writeup and
// credit). `matchVendor` returns every matched category tag; we surface the
// first one here to keep this function's existing `string | null` contract.
export function detectMerchantCategory(merchant: string): string | null {
  if (!merchant) return null;
  const { tags } = matchVendor(merchant);
  return tags[0] ?? null;
}

// ── Brand enrichment ──────────────────────────────────────────────────────────

// vendor_brands.json: "brand" → { tokens: [...], tags: [...] }
interface BrandEntry { tokens: string[]; tags: string[] }

const VENDOR_BRANDS = new Map<string, BrandEntry>(
  Object.entries(vendorBrandsRaw as Record<string, BrandEntry>)
);

export interface BrandMatch {
  brand: string;
  category: string | null;
  isOnline: boolean;
}

export function detectBrand(text: string): BrandMatch | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const [brand, entry] of VENDOR_BRANDS) {
    const matched = entry.tokens.some(t => lower.includes(t.toLowerCase()));
    if (!matched) continue;
    const isOnline = entry.tags.includes('online');
    const category = entry.tags.find(t => t !== 'online' && t !== 'network_provider') ?? null;
    return { brand, category, isOnline };
  }
  return null;
}

// ── Spam detection ────────────────────────────────────────────────────────────
// Naive Bayes binary classifier trained on Indian SMS data.
// class0 = transactional (banking, OTP, delivery), class1 = spam/promotional.
// Each word entry: [P(w|class0), P(w|class1), count0, count1, logRatio, logRatio]
// Meta: [prior0, prior1, totalWords0, totalWords1, uniqueWords0, uniqueWords1, ...]

interface CategorizerEntry {
  word: string;
  probability: [number, number, number, number, number, number];
}

interface CategorizerData {
  probabilities: CategorizerEntry[];
  meta: number[];
}

const catData = categorizerRaw as unknown as CategorizerData;
const CAT_WORD_MAP = new Map<string, [number, number]>();
for (const entry of catData.probabilities) {
  CAT_WORD_MAP.set(entry.word, [entry.probability[0], entry.probability[1]]);
}
// log(P(class0) / P(class1)) — positive favours transactional
const CAT_LOG_PRIOR = Math.log(catData.meta[0]! / catData.meta[1]!);

// Replace amount-like patterns with the placeholder token "AMT" (matches categorizer training format).
const AMT_NORM_RE = /(?:Rs\.?\s*|INR\s*|₹\s*|\$\s*|[A-Z]{2,3}\s*)[\d,]+(?:\.\d+)?|[\d]{4,}(?:[.,]\d+)*/gi;

function buildNgrams(words: string[], n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i <= words.length - n; i++) {
    out.push(words.slice(i, i + n).join(' '));
  }
  return out;
}

export function detectSpam(message: string): { isSpam: boolean; score: number } {
  const normalized = message.replace(AMT_NORM_RE, 'AMT');
  const words = normalized.split(/\s+/).filter(Boolean);

  let logScore = CAT_LOG_PRIOR;
  for (const ngrams of [buildNgrams(words, 1), buildNgrams(words, 2), buildNgrams(words, 3)]) {
    for (const ng of ngrams) {
      const probs = CAT_WORD_MAP.get(ng);
      if (!probs) continue;
      const [p0, p1] = probs;
      if (p0 > 0 && p1 > 0) {
        logScore += Math.log(p0 / p1);
      } else if (p0 > 0) {
        logScore += 5;  // exclusive class0 evidence
      } else {
        logScore -= 5;  // exclusive class1 (spam) evidence
      }
    }
  }

  return { isSpam: logScore < 0, score: logScore };
}

// ── Subcategory ───────────────────────────────────────────────────────────────

export function detectSubcategory(tags: Record<string, string>): string | null {
  const type = (tags['type'] || '').toLowerCase();
  if (type === 'upi')   return 'upi';
  if (type === 'neft')  return 'neft';
  if (type === 'imps')  return 'imps';
  if (type === 'rtgs')  return 'rtgs';
  if (type === 'aeps')  return 'aeps';
  if (tags['autdbt'])   return 'autdbt';
  if (tags['chqamt'])   return 'cheque';
  if (tags['waladd'] || tags['walsub']) return 'wallet';
  if (tags['incrdlmt']) return 'incrdlmt';
  if (tags['subsidy'])  return 'deposit';
  if (tags['otp'] || tags['pin'] || tags['code']) return 'otp';
  if (type === 'atm' || tags['wdl']) return 'atm';
  if (tags['beneacc'] || tags['beneadd']) return 'transfer';
  if (tags['decline'] || tags['autpaydecline'] || tags['trxfailed']) return 'decline';
  if (tags['emi']) return 'emi';
  if (tags['cashback']) return 'cashback';
  if (tags['ref'] && tags['type'] === 'credit') return 'refund';
  return null;
}

// ── Airport / location / offer-sender enrichment ────────────────────────────
//
// Unlike the vendor-category matcher (vendor-category-matcher.ts), the real
// consumer classes for airport.json, location.json, and offers.json could
// NOT be pinned down the same way: grepping the disassembled APK for their
// asset paths only ever surfaces a generic `getAsJSONObject(path)` cache
// dispatcher (class `Ld61/baz`) shared by many unrelated assets — the actual
// per-feature caller (if any, in this build) references it through a
// runtime-constructed key rather than the literal path string, which defeats
// a string-literal search short of tracing every call site by hand. So,
// unlike the vendor matcher, what follows is a straightforward, honestly
// JSON-shape-driven implementation (not a byte-for-byte bytecode port):
//   - airport.json is a flat {city: IATA-code} map — used here to resolve
//     IATA codes for city names mentioned in travel messages.
//   - location.json is a 4,829-entry Indian place-name gazetteer — used as a
//     fallback fill for the `location` field when the grammar's own
//     PATTERN capture (tags.location) comes up empty.
//   - offers.json is {category: [senderCode, ...]} (8 categories, 251
//     6-char DLT-style codes such as "ADIDAS", "PVRCIN", "UBERNE") — these
//     match the shape of Indian bulk-SMS sender-header fragments, so they
//     are matched the same way addr.json's sender → grammar lookup works:
//     against fragments of the SMS sender ID, not the message body.

const AIRPORT_MAP = new Map<string, string>(
  Object.entries(airportSeedRaw as Record<string, string>).map(([city, code]) => [city.toLowerCase(), code]),
);

export interface AirportMatch { city: string; code: string }

// Scans free text (e.g. a departure/arrival capture, or the whole message)
// for known city names and returns every IATA code found.
export function detectAirports(text: string): AirportMatch[] {
  if (!text) return [];
  const words = text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const seen = new Set<string>();
  const matches: AirportMatch[] = [];
  for (const word of words) {
    const code = AIRPORT_MAP.get(word);
    if (code && !seen.has(word)) {
      seen.add(word);
      matches.push({ city: word, code });
    }
  }
  return matches;
}

const LOCATION_SET = new Set<string>((locationSeedRaw as string[]).map(l => l.toLowerCase()));
const LOCATION_MULTIWORD = [...LOCATION_SET].filter(l => l.includes(' '));

// Gazetteer fallback: only called when the grammar's own PATTERN-based
// `location` tag came up empty, so this fills a gap rather than overriding
// a real capture.
export function detectLocation(text: string): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const phrase of LOCATION_MULTIWORD) {
    if (lower.includes(phrase)) return phrase;
  }
  const words = lower.split(/[^a-z]+/).filter(Boolean);
  for (const word of words) {
    if (LOCATION_SET.has(word)) return word;
  }
  return null;
}

const OFFER_SENDER_MAP = new Map<string, string>();
for (const [category, codes] of Object.entries(offersSeedRaw as Record<string, string[]>)) {
  for (const code of codes) {
    OFFER_SENDER_MAP.set(code.toLowerCase().replace(/[^a-z0-9]/g, ''), category);
  }
}

// Matches Indian bulk-SMS sender ID fragments (e.g. "AD-ADIDAS", "VM-PVRCIN")
// against offers.json's promo sender-codes to classify a GRM_OFFERS message
// into one of 8 categories (fashion, ecommerce, entertainment, travel,
// general, bank_offers, food_beverages, utility).
export function detectOfferCategory(sender: string): string | null {
  if (!sender) return null;
  const fragments = sender.toLowerCase().replace(/[^a-z0-9-_]/g, '').split(/[-_]/);
  for (const frag of fragments) {
    const cat = OFFER_SENDER_MAP.get(frag);
    if (cat) return cat;
  }
  return null;
}
