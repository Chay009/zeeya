// Bank name detection, merchant category, brand enrichment, subcategory derivation.
// All data loaded from the original Truecaller APK JSON assets.

import vendorBanksRaw from './data/vendor_banks.json';
import vendorSeedRaw from './data/vendor_seed.json';
import vendorBrandsRaw from './data/vendor_brands.json';

// ── Bank name ─────────────────────────────────────────────────────────────────

// vendor_banks.json: "bank name" → ["sender-substr", ...]
const VENDOR_BANKS: Array<[string, string[]]> = Object.entries(
  vendorBanksRaw as Record<string, string[]>
).map(([name, patterns]) => [
  // Normalize bank display names
  name === 'hdfc' ? 'HDFC Bank'
  : name === 'idbi' ? 'IDBI Bank'
  : name === 'rbi'  ? 'RBI'
  : name === 'idfc' ? 'IDFC First Bank'
  : name === 'indusind' ? 'IndusInd Bank'
  : name === 'paytm' ? 'Paytm'
  : name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
  patterns,
]);

// Additional banks not in vendor_banks.json, matched from message body
const BODY_BANK_PATTERNS: Array<[RegExp, string]> = [
  [/kotak/i,                   'Kotak Bank'],
  [/canara/i,                  'Canara Bank'],
  [/union bank/i,              'Union Bank of India'],
  [/bandhan/i,                 'Bandhan Bank'],
  [/equitas/i,                 'Equitas Small Finance Bank'],
  [/federal bank/i,            'Federal Bank'],
  [/karnataka bank/i,          'Karnataka Bank'],
  [/au small finance|au bank/i,'AU Small Finance Bank'],
  [/uco bank/i,                'UCO Bank'],
  [/central bank/i,            'Central Bank of India'],
  [/south indian bank/i,       'South Indian Bank'],
  [/indian overseas/i,         'Indian Overseas Bank'],
  [/\bindian bank\b/i,         'Indian Bank'],
  [/punjab.*sind|sind.*bank/i, 'Punjab & Sind Bank'],
  [/airtel.*bank/i,            'Airtel Payments Bank'],
  [/jio.*bank/i,               'Jio Payments Bank'],
  [/saraswat/i,                'Saraswat Bank'],
  [/dbs bank/i,                'DBS Bank'],
  [/hsbc/i,                    'HSBC'],
  [/city union/i,              'City Union Bank'],
  [/nsdl/i,                    'NSDL Payments Bank'],
  [/dhanlaxmi/i,               'Dhanlaxmi Bank'],
  [/jupiter/i,                 'Jupiter'],
  [/\bslice\b/i,               'Slice'],
  [/\bcred\b/i,                'CRED'],
  [/amex|american express/i,   'American Express'],
  [/\bsbi\b/i,                 'State Bank of India'],
];

export function detectBank(sender: string, message: string): string | null {
  const s = sender.toLowerCase();

  for (const [name, patterns] of VENDOR_BANKS) {
    if (patterns.some(p => s.includes(p))) return name;
  }

  const haystack = sender + ' ' + message;
  for (const [re, name] of BODY_BANK_PATTERNS) {
    if (re.test(haystack)) return name;
  }

  return null;
}

// ── Merchant category ─────────────────────────────────────────────────────────

// vendor_seed.json: "category" → ["keyword", ...]
// Build flat keyword → category lookup (all lowercase)
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
// "online" in tags means it's an e-commerce/online brand
interface BrandEntry {
  tokens: string[];
  tags: string[];
}

const VENDOR_BRANDS = new Map<string, BrandEntry>(
  Object.entries(vendorBrandsRaw as Record<string, BrandEntry>)
);

export interface BrandMatch {
  brand: string;
  category: string | null;
  isOnline: boolean;
}

export function detectBrand(merchant: string): BrandMatch | null {
  if (!merchant) return null;
  const lower = merchant.toLowerCase();

  for (const [brand, entry] of VENDOR_BRANDS) {
    // Match if any of the brand's token patterns appear in the merchant string
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
  // ATM/withdrawal — type field contains 'atm' when ATM token fires
  if (type === 'atm' || tags['wdl']) return 'atm';
  // Transfer patterns
  if (tags['beneacc'] || tags['beneadd']) return 'transfer';
  // Decline notifications
  if (tags['decline'] || tags['autpaydecline'] || tags['trxfailed']) return 'decline';
  // EMI
  if (tags['emi']) return 'emi';
  // Cashback
  if (tags['cashback']) return 'cashback';
  // Refund patterns (positive credit with ref)
  if (tags['ref'] && tags['type'] === 'credit') return 'refund';
  return null;
}
