// Bank name detection: vendor_banks.json sender patterns + message body fallback
// Merchant category: vendor_seed.json keyword matching against merchant name in tags

// ── Bank name ─────────────────────────────────────────────────────────────────
// From vendor_banks.json (Truecaller APK asset)
const VENDOR_BANKS: Array<[string, string[]]> = [
  ['State Bank of India', ['sbi', 'sbipg', 'state bank', 'sbh', 'oksbi']],
  ['ICICI Bank',          ['ici', 'icici', 'icicibank', 'okicici']],
  ['HDFC Bank',           ['hdf', 'hdfcltd', 'hdfc', 'okhdfc', 'hdfcbank']],
  ['Axis Bank',           ['axmob', 'axs', 'axis', 'okaxis']],
  ['YES Bank',            ['ybl', 'yesbank', 'yes']],
  ['Bank of India',       ['boi']],
  ['Paytm',               ['ptm', 'paytm']],
  ['IDBI Bank',           ['idbi', 'idb']],
  ['Bank of Baroda',      ['bob', 'baroda']],
  ['PNB',                 ['pnb']],
  ['RBI',                 ['rbi']],
  ['IDFC First Bank',     ['idfc']],
  ['IndusInd Bank',       ['iib']],
];

// Body fallback for banks not in vendor_banks.json
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
  [/slice/i,                   'Slice'],
  [/cred\b/i,                  'CRED'],
  [/amex|american express/i,   'American Express'],
];

export function detectBank(sender: string, message: string): string | null {
  const s = sender.toLowerCase();

  // Layer 1: sender substring match (vendor_banks.json)
  // Real Indian SMS senders: "VM-HDFCBK", "AD-SBIINB" — substring is enough
  for (const [name, patterns] of VENDOR_BANKS) {
    if (patterns.some(p => s.includes(p))) return name;
  }

  // Layer 2: message body keyword match
  const haystack = sender + ' ' + message;
  for (const [re, name] of BODY_BANK_PATTERNS) {
    if (re.test(haystack)) return name;
  }

  return null;
}

// ── Merchant category ─────────────────────────────────────────────────────────
// From vendor_seed.json (Truecaller APK asset), keyword → category
// Built as a flat lookup: lowercase keyword → category name
const MERCHANT_CATEGORY_MAP = new Map<string, string>([
  // entertainment
  ...['cinemas','fun','hotstar','leisure','movies','multiplex','one97','pvr','sports','entertainment'].map(k => [k,'entertainment'] as [string,string]),
  // food
  ...['khhao','aahara','refreshment','food','kfc','mcd','mcdonalds','dominos','pizza','zomato','swiggy','cafe','restaurant','dhaba','biryani','burger','bakery','canteen','eatery','diner','kitchen'].map(k => [k,'food'] as [string,string]),
  // travel
  ...['airport','cleartrip','goibibo','ibibo','makemytrip','irctc','ola','uber','rapido','bus','train','flight','cab','taxi','redbus'].map(k => [k,'travel'] as [string,string]),
  // fuel
  ...['bpcl','hpcl','iocl','essar','petrol','diesel','fuel','filling','coco','shell'].map(k => [k,'fuel'] as [string,string]),
  // medical
  ...['medi','care','chemist','clinic','dental','hospital','pharma','pharmacy','health','apollo','fortis','medplus','netmeds'].map(k => [k,'medical'] as [string,string]),
  // shopping
  ...['shop','bazaar','dmart','amazon','flipkart','myntra','meesho','nykaa','ajio','reliance','tata','bigbasket','grofers','blinkit','zepto','instamart'].map(k => [k,'shopping'] as [string,string]),
  // e-commerce
  ...['ecommerce','ecom','snapdeal','shopclues','paytmmall'].map(k => [k,'e-commerce'] as [string,string]),
  // fashion
  ...['apparels','fashion','garments','dress','shoes','clothes','boutique','khadi','handloom'].map(k => [k,'fashion'] as [string,string]),
  // monetary / investments
  ...['mutual','insurance','sip','stock','cams','nsdl','zerodha','groww','upstox','kuvera'].map(k => [k,'monetary'] as [string,string]),
  // utilities / payments
  ...['electricity','water','gas','broadband','dth','recharge','postpaid','bill','utility','bescom','tpddl','msedcl'].map(k => [k,'payments'] as [string,string]),
  // communication
  ...['vodafone','airtel','idea','bsnl','jio','vi'].map(k => [k,'communication'] as [string,string]),
  // transfer
  ...['neft','upi','imps','rtgs','transfer','remit'].map(k => [k,'transfer'] as [string,string]),
  // withdrawal
  ...['atm','wdl','withdraw','cash'].map(k => [k,'withdrawal'] as [string,string]),
  // hospitality
  ...['hotel','resort','oyo','marriott','taj','inn','lodge','homestay'].map(k => [k,'hospitality'] as [string,string]),
  // fitness
  ...['gym','spa','fitness','decathlon','cult'].map(k => [k,'fitness'] as [string,string]),
  // automobile
  ...['automobile','motors','car','service','garage'].map(k => [k,'automobile'] as [string,string]),
]);

export function detectMerchantCategory(merchant: string): string | null {
  if (!merchant) return null;
  const lower = merchant.toLowerCase();
  // Try exact token match first
  for (const [keyword, category] of MERCHANT_CATEGORY_MAP) {
    if (lower.includes(keyword)) return category;
  }
  return null;
}

// ── Subcategory ───────────────────────────────────────────────────────────────
// Derived from grammar tags already in the result
// Maps tag names → subcategory strings matching Categories$TrxSubCategory
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
  return null;
}
