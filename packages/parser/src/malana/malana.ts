import type { Token, SeedData, MalanaResult, TrxTypeRich } from './types';
import { regexTokenize } from './regex-tokenizer';
import { KeywordTokenizer } from './keyword-tokenizer';
import { compileSeed } from './grammar-compiler';
import { runGrammar } from './grammar-runner';
import { compilePatterns, runPatterns } from './pattern-extractor';
import { detectBank, detectMerchantCategory, detectSubcategory, detectBrand, grammarForSender, detectUpiHandle, detectSpam, detectAirports, detectLocation, detectOfferCategory } from './enrichment';

// ── Grammar auto-routing ───────────────────────────────────────────────────────
// Token types produced by the keyword tokenizer that identify a specific grammar.
// Priority order: earlier rows win (OTP before TRAVEL before DELIVERY, etc.)
const GRAMMAR_ROUTING: Array<[readonly string[], string]> = [
  [['OTP', 'PINCODE'], 'GRM_OTP'],
  [['FLIGHT', 'PNR', 'TICKET', 'TICKETNO', 'TRIPCODE', 'BUSNO', 'BOOKINGID', 'MTICKET', 'FLTID'], 'GRM_TRAVEL'],
  [['ORDERID', 'TRACKINGID', 'ORDER', 'TRACK'], 'GRM_DELIVERY'],
  [['OFFER', 'OFFERSINTRX', 'OFFERCODE', 'USECODE', 'OFFERS'], 'GRM_OFFERS'],
  [['STOCKEXCHNG', 'STOCKTRADE', 'STOCKUNITS'], 'GRM_STOCKUPDATES'],
];

function routeGrammar(tokens: Token[], defaultCategory: string): string {
  const types = new Set(tokens.map(t => t.type));
  for (const [markers, grammar] of GRAMMAR_ROUTING) {
    if (markers.some(m => types.has(m))) return grammar;
  }
  return defaultCategory;
}

// ── Token merge ────────────────────────────────────────────────────────────────
// Merge regex-extracted tokens with keyword tokens, sorted by position in message.
// Regex tokens take priority; keyword tokens only fill uncovered positions.
function mergeTokens(regexTokens: Token[], keywordTokens: Token[], message: string): Token[] {
  const lower = message.toLowerCase();
  const positioned: Array<{ token: Token; pos: number; end: number }> = [];

  for (const t of regexTokens) {
    const idx = message.indexOf(t.raw);
    if (idx !== -1) {
      positioned.push({ token: t, pos: idx, end: idx + t.raw.length });
    }
  }

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

// ── Tag value selection ────────────────────────────────────────────────────────
// Pick the most meaningful value for a given tag type.
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

// Every literal (non-generic) token type that appears in a BAL[bal] grammar
// rule across the seed (GRM_BANK: "BLNC AMT,AVBL BAL,CURR {0}BAL,TOTAL BAL,
// BLNC NUM,CLRNC BAL,AMT AUX BLNC,AVBL {2}AMT"; GRM_BILL is a subset). AMT/NUM
// are excluded — they're the generic amount side of every rule, not evidence
// of a balance statement on their own.
const BALANCE_INDICATOR_TYPES = new Set(['BLNC', 'AVBL', 'BAL', 'CURR', 'TOTAL', 'CLRNC']);

function baseType(t: string): string {
  return t.replace(/\d+$/, '');
}

function isBalanceIndicatorPair(values: Record<string, string>): boolean {
  const prev = values['_prevType'];
  const next = values['_nextType'];
  return (
    (!!prev && BALANCE_INDICATOR_TYPES.has(baseType(prev))) ||
    (!!next && BALANCE_INDICATOR_TYPES.has(baseType(next)))
  );
}

// ── Rich type derivation ───────────────────────────────────────────────────────
// Transfer methods: these override 'debit' direction in the grammar (grammar-runner PAYMENT_METHODS).
// When trxType is one of these, money definitely left the account → TRANSFER.
const TRANSFER_METHODS = new Set(['neft', 'imps', 'rtgs', 'aeps']);

function deriveRichType(tags: Record<string, string>, kwToks: Token[]): TrxTypeRich | null {
  // Plan validity/expiry notice (rechrgnumexp — "plan expires on X" / "validity ends"). This
  // is Truecaller's own dedicated grammar tag for an expiry notice, distinct from rechrgsucc
  // (a confirmed recharge). It must win even when another tag also matched on the same
  // message — e.g. a "recharge before it expires" call-to-action can trip rechrgsucc's
  // `INTENT{2}RECHRG` sub-pattern purely from the word "recharge" appearing near an
  // intent-shaped word, with no actual recharge having happened. An expiry notice is never
  // itself a completed transaction, so it's checked first and overrides everything below.
  if (tags['rechrgnumexp']) return null;

  // Investment (MF, SIP, equity, stocks)
  if (tags['navval'] || tags['folio'] || tags['equity']) return 'INVESTMENT';

  // Wallet operations — checked BEFORE balance-only because wallet SMS often also show balance
  if (tags['waladd']) return 'WALLET_CREDIT';
  if (tags['walsub']) return 'WALLET_DEBIT';

  // Balance-only: balance present but no transaction amount and no other specific type detected
  if (tags['bal'] && !tags['trx']) return 'BALANCE_UPDATE';

  // Recharge (rechrgsucc = confirmed recharge amount tag)
  if (tags['rechrgsucc'] || (tags['rechrg'] && tags['trx'])) return 'RECHARGE';

  // Salary / wages — check keyword token since 'salary' is not a grammar tag
  const hasSalaryKw = kwToks.some(t => t.type === 'SALARY');
  if (hasSalaryKw && (tags['trx'] || (tags['type'] ?? '').toLowerCase() === 'credit')) return 'SALARY';

  // Auto-debit / autopay keyword + active transaction
  const hasAutDbtKw = kwToks.some(t => t.type === 'AUTDBT');
  if (hasAutDbtKw && tags['trx']) return 'AUTO_DEBIT';

  // ATM withdrawal — ATM/ATMWDL keyword token + active transaction
  const hasAtmKw = kwToks.some(t => t.type === 'ATM' || t.type === 'ATMWDL');
  if (hasAtmKw && tags['trx']) return 'ATM_WITHDRAWAL';

  const t = (tags['type'] ?? '').toLowerCase();
  if (TRANSFER_METHODS.has(t)) return 'TRANSFER';
  if (t === 'debit' || t === 'upi' || t === '') {
    // TRANSFER keyword (_norm=neft/imps/rtgs/aeps) present alongside a debit direction → TRANSFER
    // The keyword token carries _norm but NOT a 'type' key, so tags['type'] stays 'debit'.
    // We check kwToks here to avoid mutating the raw tags that the benchmark reads.
    const hasTransferMethod = kwToks.some(
      tok => tok.type === 'TRANSFER' && TRANSFER_METHODS.has(tok.values['_norm'] ?? '')
    );
    if (hasTransferMethod && (t === 'debit' || t === '')) return 'TRANSFER';
    if (t === 'debit' || t === 'upi') return 'EXPENSE';
  }
  if (t === 'credit') return 'INCOME';
  return null;
}

// ── Currency detection ─────────────────────────────────────────────────────────
// Uses the CRNCY keyword token which covers 18+ currencies from the seed TOKENS definition.
// CRNCY[crncy] → normalised value (e.g. 'usd', 'eur', 's$', 'lkr', 'ksh', 'cny', …)
// kwToks (pre-merge) retains CRNCY tokens even when they overlap with AMT regex tokens.
const CRNCY_TO_ISO: Record<string, string> = {
  rs: 'INR', inr: 'INR',
  usd: 'USD', '$': 'USD',
  cad: 'CAD',
  eur: 'EUR',
  gbp: 'GBP',
  aed: 'AED',
  jpy: 'JPY',
  aud: 'AUD',
  's$': 'SGD',
  lkr: 'LKR',
  ksh: 'KES',
  kr: 'SEK',   // Scandinavian kr family (SEK / NOK / DKK) — SEK as default
  cny: 'CNY',
  egp: 'EGP',
  ghc: 'GHS',  // Ghana Cedi (seed normalises both ghc and ghs → ghc)
};

// Fallback for currency prefixes attached directly to digits (e.g. "S$50", "A$100").
// The keyword tokenizer requires a word boundary after the prefix, so "S$50" is missed.
const ATTACHED_CURR_RE = /\b(S\$|A\$|C\$|HK\$|NZ\$|€|£|\$|¥|₹)\d/;
const ATTACHED_CURR_MAP: Record<string, string> = {
  'S$': 'SGD', 'A$': 'AUD', 'C$': 'CAD', 'HK$': 'HKD', 'NZ$': 'NZD',
  '€': 'EUR', '£': 'GBP', '$': 'USD', '¥': 'JPY', '₹': 'INR',
};

function detectCurrency(kwToks: Token[], message: string): string {
  for (const t of kwToks) {
    if (t.type !== 'CRNCY') continue;
    const norm = t.values['crncy'] ?? '';
    const iso = CRNCY_TO_ISO[norm];
    if (iso) return iso;
  }
  // Fallback: currency symbol directly attached to digit (no word boundary)
  const m = message.match(ATTACHED_CURR_RE);
  if (m) {
    const iso = ATTACHED_CURR_MAP[m[1] ?? ''];
    if (iso) return iso;
  }
  return 'INR';
}

export class MalanaEngine {
  private keywordTokenizer: KeywordTokenizer;
  private seed: SeedData;
  // Pre-compiled patterns per grammar category; populated lazily
  private patternCache = new Map<string, ReturnType<typeof compilePatterns>>();

  constructor(seed: SeedData) {
    this.seed = seed;
    this.keywordTokenizer = new KeywordTokenizer(seed.TOKENS);
  }

  private getPatternsFor(category: string) {
    if (this.patternCache.has(category)) return this.patternCache.get(category)!;
    const grammarEntry = this.seed.GRAMMAR[category];
    const allPatterns = [
      ...(grammarEntry?.PATTERN ?? []),
      ...(grammarEntry?.STRUCT ?? []),
    ];
    const compiled = compilePatterns(allPatterns);
    this.patternCache.set(category, compiled);
    return compiled;
  }

  parse(message: string, sender = '', defaultCategory = 'GRM_BANK'): MalanaResult {
    // Step 1: Tokenize
    const regexToks = regexTokenize(message);
    const kwToks = this.keywordTokenizer.tokenize(message);
    const allTokens = mergeTokens(regexToks, kwToks, message);

    // Step 2: Auto-route to the correct grammar category.
    // Token-type routing wins (OTP/PNR/ORDER tokens are strongest signal — banks also send OTPs).
    // Sender addr.json lookup is the fallback when no specific token type is detected.
    const tokenCategory = routeGrammar(allTokens, '');
    const senderGrammar = grammarForSender(sender);
    const category = tokenCategory || senderGrammar || defaultCategory;

    // Step 3: Compile grammar layers for category
    const layers = compileSeed(this.seed, category);
    // Routing itself constitutes detection when we've moved away from the default
    let detectedCategory: string | null = category !== defaultCategory ? category : null;

    // Step 4: Run grammar FSA passes
    const processed = runGrammar(allTokens, layers);

    // Step 5: Extract result tags
    const tags: Record<string, string> = {};

    for (const token of processed) {
      if (!token.matched) continue;
      const tag = token.values['_tag'];
      if (tag) {
        // BAL[bal]'s grammar rules (BLNC AMT, AVBL BAL, AMT AUX BLNC, ...) all
        // require a real balance-indicating word — but the compiler reduces
        // multi-token chains pairwise, and each pair independently satisfies
        // the rule (a compiler limitation, not something safe to change here
        // without risking other rules — see the "AMT AUX BLNC" chain, where
        // the FIRST pair alone is "AMT-AUX", with no balance word at all).
        // For "bal" specifically, cross-check that the matched pair actually
        // touches one of the rule's own balance-indicating token types before
        // trusting it, so e.g. "Rs.1999.00 is successfully created..." (an
        // amount followed by any auxiliary verb) can't masquerade as a
        // balance statement.
        const trustworthy = tag !== 'bal' || isBalanceIndicatorPair(token.values);
        if (trustworthy) {
          const tagValue = pickTagValue(tag, token.values);
          if (tagValue) tags[tag] = tagValue;
          if (!detectedCategory) detectedCategory = category;
        }
      }
      for (const [k, v] of Object.entries(token.values)) {
        if (k.startsWith('_') || !v) continue;
        if (k === 'amount' && tags['trx']) continue;
        if ((k === 'acc' || k === 'instrno') && tags[k]) continue;
        tags[k] = v;
      }
    }

    // ── Fallbacks for common Indian bank SMS patterns ──────────────────────────

    // 1. Direction from unmatched TRX/TRANS tokens (e.g. "debited FOR Rs.X")
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

    // 2. INCRDLMT from PREP+AMT pairs (e.g. "debited WITH Rs.5000")
    if (!tags['trx'] && tags['incrdlmt'] && tags['type']) {
      tags['trx'] = tags['incrdlmt'];
      if (!detectedCategory) detectedCategory = category;
    }

    // 3. Transaction amount from first unmatched AMT when direction is known
    if (!tags['trx'] && tags['type']) {
      for (const token of processed) {
        if (!token.matched && token.type === 'AMT') {
          tags['trx'] = token.text || token.raw;
          if (!detectedCategory) detectedCategory = category;
          break;
        }
      }
    }

    // 4. BAL immediately before unmatched TRX holds the transaction amount
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

    // 5. Balance-only message: BLNC keyword present but no bal/trx — grab first unmatched AMT as bal
    if (!tags['bal'] && !tags['trx']) {
      const hasBlnc = kwToks.some(t => t.type === 'BLNC');
      if (hasBlnc) {
        for (const token of processed) {
          if (!token.matched && token.type === 'AMT') {
            tags['bal'] = token.text || token.raw;
            if (!detectedCategory) detectedCategory = category;
            break;
          }
        }
      }
    }

    // Step 6: PATTERN/STRUCT extraction — extract named captures (#vendor, #item, etc.)
    const patternCaptures = runPatterns(this.getPatternsFor(category), processed);
    // Merge into tags (don't overwrite grammar-derived values)
    for (const [k, v] of Object.entries(patternCaptures)) {
      if (v && !tags[k]) tags[k] = v;
    }

    // Step 7: Brand enrichment — check extracted merchant text first, then fall back to raw message
    const merchantText = tags['bene'] || tags['vendor'] || tags['billvendor'] || tags['merchant'] || tags['item'] || '';
    const brandMatch = detectBrand(merchantText) ?? detectBrand(message);

    // Step 8: UPI handle detection — if bene/vendor looks like a VPA, confirm handle
    const vpaText = tags['bene'] || tags['vendor'] || '';
    const upiHandle = detectUpiHandle(vpaText);

    // Step 9: Derived rich fields
    const trxTypeRich = deriveRichType(tags, kwToks);
    const currency = detectCurrency(kwToks, message);
    const isFromCard = kwToks.some(t =>
      t.type === 'INS' && ['card', 'creditcard', 'debitcard'].includes(t.values['_norm'] ?? '')
    );
    const spam = detectSpam(message);

    // Build typed result
    const result: MalanaResult = {
      category: detectedCategory,
      tags,
      tokens: processed,

      bankName: detectBank(sender, message),
      merchantCategory: brandMatch?.category ?? detectMerchantCategory(merchantText),
      subcategory: detectSubcategory(tags),

      // Bank fields
      trx: tags['trx'] || null,
      bal: tags['bal'] || null,
      acc: tags['acc'] || tags['instrno'] || null,
      trxType: tags['type'] || null,
      trxTypeRich,
      currency,
      isFromCard,
      creditLimit: tags['crdlmt'] || null,
      ref: tags['ref'] || null,
      bene: tags['bene'] || null,
      beneAcc: tags['beneacc'] || null,
      vendor: tags['vendor'] || tags['billvendor'] || tags['merchant'] || null,
      location: tags['location'] || detectLocation(message),

      // OTP fields
      otp: tags['otp'] || tags['pin'] || tags['code'] || null,
      otpExpiry: tags['expire'] || null,

      // Travel fields
      pnr: tags['pnr'] || null,
      flight: tags['flt'] || tags['flight_name'] || null,
      departure: tags['dept'] || null,
      arrival: tags['arrv'] || null,
      fare: tags['fare'] || null,
      trainBusNo: tags['train'] || tags['bus'] || null,
      boardingGate: tags['boardgate'] || null,
      departureCode: detectAirports(tags['from_loc'] || '')[0]?.code ?? null,
      arrivalCode: detectAirports(tags['to_loc'] || '')[0]?.code ?? null,

      // Delivery fields
      orderNo: tags['order'] || null,
      trackingId: tags['tracking'] || null,
      deliveryStatus: tags['delivery'] || tags['ordstatus'] || null,
      item: tags['item'] || null,

      // Bill fields
      billAmount: tags['bill'] || null,
      emiAmount: tags['emi'] || null,
      dueDate: tags['due'] || null,
      policyNo: tags['policy'] || null,
      rechargeAmount: tags['rechrg'] || tags['rechrgsucc'] || null,
      mandateAmount: tags['mandate'] || null,

      // Offer fields
      cashback: tags['cashback'] || null,
      discount: tags['discount'] || null,
      offerCode: tags['code'] || null,
      offerCategory: detectOfferCategory(sender),

      // Telecom fields
      dataLeft: tags['left'] || null,
      packBalance: tags['packbal'] || null,

      // Stocks fields
      navValue: tags['navval'] || null,
      folio: tags['folio'] || null,
      marginAmount: tags['margin'] || null,

      // Brand fields
      brandName: brandMatch?.brand ?? null,
      isOnlineBrand: brandMatch?.isOnline ?? false,

      // UPI
      upiHandle: upiHandle,

      // Spam detection
      isSpam: spam.isSpam,
      spamScore: spam.score,
    };

    return result;
  }
}

export type { SeedData, MalanaResult };
