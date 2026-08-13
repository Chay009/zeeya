// Bank name detection, merchant category, brand enrichment, subcategory derivation.
// All data loaded from the original Truecaller APK JSON assets.

import vendorBanksRaw  from './data/vendor_banks.json';
import vendorSeedRaw   from './data/vendor_seed.json';
import vendorBrandsRaw from './data/vendor_brands.json';
import bankSeedRaw     from './data/bank.json';     // malanaSeed — 32 banks, complete sender IDs
import addrSeedRaw     from './data/addr.json';     // malanaSeed — 424 sender IDs → grammar category
import upiSeedRaw      from './data/upi.json';      // malanaSeed — 111 UPI handles

// ── Sender → grammar category (addr.json) ─────────────────────────────────────
// "GRM_BANK" → ["ICICIB", "HDFCBK", ...]
// Inverted to senderFragment → grammar for fast lookup.
const SENDER_GRAMMAR_MAP = new Map<string, string>();
for (const [grammar, senders] of Object.entries(addrSeedRaw as Record<string, string[]>)) {
  for (const s of senders) {
    SENDER_GRAMMAR_MAP.set(s.toLowerCase(), grammar);
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
// used as supplementary match layer.
const VENDOR_BANKS: Array<[string, string[]]> = Object.entries(
  vendorBanksRaw as Record<string, string[]>
).map(([name, patterns]) => [
  name === 'hdfc'     ? 'HDFC Bank'
  : name === 'idbi'   ? 'IDBI Bank'
  : name === 'rbi'    ? 'RBI'
  : name === 'idfc'   ? 'IDFC First Bank'
  : name === 'indusind' ? 'IndusInd Bank'
  : name === 'paytm'  ? 'Paytm'
  : name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
  patterns,
] as [string, string[]]);

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

// vendor_seed.json: "category" → ["keyword", ...]  (31 categories)
const MERCHANT_CATEGORY_MAP = new Map<string, string>();
for (const [category, keywords] of Object.entries(vendorSeedRaw as Record<string, string[]>)) {
  for (const kw of keywords) {
    if (kw && !MERCHANT_CATEGORY_MAP.has(kw.toLowerCase())) {
      MERCHANT_CATEGORY_MAP.set(kw.toLowerCase(), category);
    }
  }
}

export function detectMerchantCategory(merchant: string): string | null {
  if (!merchant) return null;
  const lower = merchant.toLowerCase();
  for (const [keyword, category] of MERCHANT_CATEGORY_MAP) {
    if (lower.includes(keyword)) return category;
  }
  return null;
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
