import type { Token, SeedData, MalanaResult } from './types';
import { regexTokenize } from './regex-tokenizer';
import { KeywordTokenizer } from './keyword-tokenizer';
import { compileSeed } from './grammar-compiler';
import { runGrammar } from './grammar-runner';
import { compilePatterns, runPatterns } from './pattern-extractor';
import { detectBank, detectMerchantCategory, detectSubcategory, detectBrand, grammarForSender, detectUpiHandle } from './enrichment';

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
    const idx = message.indexOf(t.text);
    if (idx !== -1) {
      positioned.push({ token: t, pos: idx, end: idx + t.text.length });
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
        const tagValue = pickTagValue(tag, token.values);
        if (tagValue) tags[tag] = tagValue;
        if (!detectedCategory) detectedCategory = category;
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
          tags['trx'] = token.raw;
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
      ref: tags['ref'] || null,
      bene: tags['bene'] || null,
      beneAcc: tags['beneacc'] || null,
      vendor: tags['vendor'] || tags['billvendor'] || tags['merchant'] || null,
      location: tags['location'] || null,

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
    };

    return result;
  }
}

export type { SeedData, MalanaResult };
