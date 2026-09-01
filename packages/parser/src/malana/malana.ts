import type {
  Token,
  SeedData,
  MalanaResult,
  TrxTypeRich,
  MalanaCategory,
  MalanaCategoryEvidence,
} from "./types";
import { regexTokenize } from "./regex-tokenizer";
import { KeywordTokenizer } from "./keyword-tokenizer";
import { compileSeed } from "./grammar-compiler";
import { runGrammar } from "./grammar-runner";
import { compilePatterns, runPatterns } from "./pattern-extractor";
import { CurrencyRegistry } from "./currency-registry";
import { extractRawMerchant } from "./merchant-extractor";
import {
  categoryMarkerEvidence,
  isPromotionalLoanSolicitation,
  isMalanaCategory,
  isProductCategory,
  routePrimaryCategory,
  selectCategoryCandidates,
} from "./category-policy";
import { composeCategoryResults, type ParsedCategory } from "./category-result";
import {
  detectBank,
  detectMerchantCategory,
  detectSubcategory,
  detectBrand,
  grammarForSender,
  detectUpiHandle,
  detectSpam,
  detectAirports,
  detectLocation,
  detectOfferCategory,
  isMandateCancelled,
  extractMandateMerchant,
} from "./enrichment";

// ── Grammar auto-routing ───────────────────────────────────────────────────────
// ── Token merge ────────────────────────────────────────────────────────────────
// Merge regex-extracted tokens with keyword tokens, sorted by position in message.
// Regex tokens take priority; keyword tokens only fill uncovered positions.
function mergeTokens(regexTokens: Token[], keywordTokens: Token[], message: string): Token[] {
  const lower = message.toLowerCase();
  const positioned: Array<{ token: Token; pos: number; end: number }> = [];

  let regexSearchFrom = 0;
  for (const t of regexTokens) {
    // regexTokenize scans left-to-right, so resolve repeated raw values from
    // the end of the preceding token instead of mapping every occurrence to
    // the first identical substring in the message.
    const idx = message.indexOf(t.raw, regexSearchFrom);
    if (idx !== -1) {
      const end = idx + t.raw.length;
      positioned.push({ token: t, pos: idx, end });
      regexSearchFrom = end;
    }
  }

  let searchFrom = 0;
  for (const t of keywordTokens) {
    const idx = lower.indexOf(t.text.toLowerCase(), searchFrom);
    if (idx === -1) continue;
    const end = idx + t.text.length;
    const overlaps = positioned.some((p) => idx < p.end && end > p.pos);
    if (!overlaps) {
      positioned.push({ token: t, pos: idx, end });
    }
    searchFrom = idx + 1;
  }

  positioned.sort((a, b) => a.pos - b.pos);
  return positioned.map((p) => p.token);
}

// ── Tag value selection ────────────────────────────────────────────────────────
// Pick the most meaningful value for a given tag type.
function pickTagValue(tag: string, values: Record<string, string>): string {
  switch (tag) {
    case "trx":
    case "bal":
    case "waladd":
    case "walsub":
    case "crdlmt":
    case "totcrdlmt":
    case "incrdlmt":
    case "chqamt":
    case "subsidy":
      return values["amount"] || "";
    case "acc":
    case "beneacc":
      return values["instrno"] || values["idval"] || "";
    case "ref":
      return values["instrno"] || values["idval"] || "";
    case "trxcatg":
    case "bene":
    case "beneadd":
      return values["idval"] || "";
    default:
      return values["amount"] || values["instrno"] || values["idval"] || "";
  }
}

// Structural "carries a scalar value" leaf types (grammar-runner.ts's
// inheritLeafValues pulls these into merged.values['amount']/['instrno']/etc)
// — reused across dozens of unrelated rules, never balance-specific on their
// own. Mirrors that function's own type list; kept separate here rather than
// importing it since inheritLeafValues checks types inline, not via a set.
const LEAF_VALUE_TYPES = new Set(["AMT", "NUM", "INSTRNO", "IDVAL", "DATE", "DATETIME"]);

// A token type is a grammatical function word (not a semantic keyword) when
// its own seed.TOKENS entry carries a [_pos=...] marker — the same marker
// the seed itself uses for DET/AUX/PREP/PREPV/ART. Confirmed directly: AUX's
// entry is 'AUX[_pos=aux]' (excluded), while BLNC/AVBL/CURR/TOTAL/CLRNC have
// plain entries with no such marker (included).
function isGrammaticalFunctionWord(type: string, seed: SeedData): boolean {
  return Object.keys(seed.TOKENS).some((k) => k.startsWith(`${type}[_pos=`));
}

// Derives every real balance-indicating token type by parsing the literal
// text of every [bal]-tagged grammar rule across the whole seed (not just
// BAL[bal] — GRM_BANK also has INSUFFBAL[bal]: "INSUFF BLNC,BLNC {6}INSUFF",
// contributing INSUFF ("insufficient") — a rule easy to miss by hand, which
// is the actual point of deriving this instead of hand-typing it). Excludes
// leaf-value types and grammatical function words; every other literal token
// type mentioned is a real semantic balance word by construction.
export function deriveBalanceIndicatorTypes(seed: SeedData): Set<string> {
  const result = new Set<string>();
  for (const category of Object.values(seed.GRAMMAR)) {
    for (const layer of category.GRMR ?? []) {
      for (const [resultKey, rulesStr] of Object.entries(layer)) {
        if (!resultKey.endsWith("[bal]")) continue;
        for (const rule of rulesStr.split(",")) {
          for (const part of rule.trim().split(/\s+/).filter(Boolean)) {
            const gapMatch = /^\{[^}]*\}(.+)$/.exec(part);
            const type = gapMatch ? gapMatch[1] : part;
            if (!type || LEAF_VALUE_TYPES.has(type) || isGrammaticalFunctionWord(type, seed))
              continue;
            result.add(type);
          }
        }
      }
    }
  }
  return result;
}

function baseType(t: string): string {
  return t.replace(/\d+$/, "");
}

function isBalanceIndicatorPair(
  values: Record<string, string>,
  balanceIndicatorTypes: Set<string>,
): boolean {
  const prev = values["_prevType"];
  const next = values["_nextType"];
  return (
    (!!prev && balanceIndicatorTypes.has(baseType(prev))) ||
    (!!next && balanceIndicatorTypes.has(baseType(next)))
  );
}

// ── Rich type derivation ───────────────────────────────────────────────────────
// Transfer methods: these override 'debit' direction in the grammar (grammar-runner PAYMENT_METHODS).
// When trxType is one of these, money definitely left the account → TRANSFER.
const TRANSFER_METHODS = new Set(["neft", "imps", "rtgs", "aeps"]);

function hasInactiveTransactionStatus(message: string, tags: Record<string, string>): boolean {
  if (tags["decline"] || tags["autpaydecline"] || tags["trxfailed"]) return true;

  // The seed declares "decline" but omits the overwhelmingly common past-tense
  // form "declined". Keep this compatibility gap local to transaction status;
  // broad stemming in the keyword tokenizer would change every grammar family.
  // Require transaction context and a status-shaped ending so merchant/free
  // text such as "Declined Cafe" cannot invalidate a completed debit.
  return /\b(?:transaction|txn|payment|purchase|withdrawal|transfer|recharge|debit|credit|charge)\b[\s\S]{0,120}?\b(?:declined|failed|unsuccessful|reversed|pending|on hold)\b(?=\s+(?:at|due|because|for|by|as|since|until|with)\b|[.!?,;]|$)/i.test(
    message,
  );
}

function deriveRichType(tags: Record<string, string>, kwToks: Token[]): TrxTypeRich | null {
  // Plan validity/expiry notice (rechrgnumexp — "plan expires on X" / "validity ends"). This
  // is Truecaller's own dedicated grammar tag for an expiry notice, distinct from rechrgsucc
  // (a confirmed recharge). It must win even when another tag also matched on the same
  // message — e.g. a "recharge before it expires" call-to-action can trip rechrgsucc's
  // `INTENT{2}RECHRG` sub-pattern purely from the word "recharge" appearing near an
  // intent-shaped word, with no actual recharge having happened. An expiry notice is never
  // itself a completed transaction, so it's checked first and overrides everything below.
  if (tags["rechrgnumexp"]) return null;

  // Investment (MF, SIP, equity, stocks)
  if (tags["navval"] || tags["folio"] || tags["equity"]) return "INVESTMENT";

  // Wallet operations — checked BEFORE balance-only because wallet SMS often also show balance
  if (tags["waladd"]) return "WALLET_CREDIT";
  if (tags["walsub"]) return "WALLET_DEBIT";

  // Balance-only: balance present but no transaction amount and no other specific type detected
  if (tags["bal"] && !tags["trx"]) return "BALANCE_UPDATE";

  // Recharge (rechrgsucc = confirmed recharge amount tag)
  if (tags["rechrgsucc"] || (tags["rechrg"] && tags["trx"])) return "RECHARGE";

  // Salary / wages — check keyword token since 'salary' is not a grammar tag
  const hasSalaryKw = kwToks.some((t) => t.type === "SALARY");
  if (hasSalaryKw && (tags["trx"] || (tags["type"] ?? "").toLowerCase() === "credit"))
    return "SALARY";

  // Auto-debit / autopay keyword + active transaction
  const hasAutDbtKw = kwToks.some((t) => t.type === "AUTDBT");
  if (hasAutDbtKw && tags["trx"]) return "AUTO_DEBIT";

  // ATM withdrawal — ATM/ATMWDL keyword token + active transaction
  const hasAtmKw = kwToks.some((t) => t.type === "ATM" || t.type === "ATMWDL");
  if (hasAtmKw && tags["trx"]) return "ATM_WITHDRAWAL";

  const t = (tags["type"] ?? "").toLowerCase();
  if (TRANSFER_METHODS.has(t) && tags["trx"]) return "TRANSFER";
  if (t === "debit" || t === "upi" || t === "") {
    // TRANSFER keyword (_norm=neft/imps/rtgs/aeps) present alongside a debit direction → TRANSFER
    // The keyword token carries _norm but NOT a 'type' key, so tags['type'] stays 'debit'.
    // We check kwToks here to avoid mutating the raw tags that the benchmark reads.
    const hasTransferMethod = kwToks.some(
      (tok) => tok.type === "TRANSFER" && TRANSFER_METHODS.has(tok.values["_norm"] ?? ""),
    );
    if (hasTransferMethod && tags["trx"] && (t === "debit" || t === "")) return "TRANSFER";
    if ((t === "debit" || t === "upi") && tags["trx"]) return "EXPENSE";
  }
  if (t === "credit" && tags["trx"]) return "INCOME";
  return null;
}

function detectCurrency(
  registry: CurrencyRegistry,
  kwToks: Token[],
  regexToks: Token[],
  preferredCurrency?: string,
): string {
  if (preferredCurrency) return preferredCurrency;

  for (const token of regexToks) {
    const currency = token.values["currency"];
    if (token.type === "AMT" && currency) return currency;
  }

  for (const t of kwToks) {
    if (t.type !== "CRNCY") continue;
    const norm = t.values["crncy"] ?? "";
    const iso = registry.isoForAlias(norm);
    if (iso) return iso;
  }
  return "INR";
}

export class MalanaEngine {
  private keywordTokenizer: KeywordTokenizer;
  private seed: SeedData;
  // Pre-compiled patterns per grammar category; populated lazily
  private patternCache = new Map<string, ReturnType<typeof compilePatterns>>();
  // Pre-compiled grammar (GRMR) layers per category; populated lazily. Was
  // being recompiled on every single parse() call — real cost given the app
  // bulk-parses up to 5,000 messages per screen load, all through the same
  // small set of grammar categories.
  private layerCache = new Map<string, ReturnType<typeof compileSeed>>();
  private balanceIndicatorTypes: Set<string>;
  private currencyRegistry: CurrencyRegistry;

  constructor(seed: SeedData) {
    this.seed = seed;
    this.keywordTokenizer = new KeywordTokenizer(seed.TOKENS);
    this.balanceIndicatorTypes = deriveBalanceIndicatorTypes(seed);
    this.currencyRegistry = new CurrencyRegistry(seed);
  }

  private getPatternsFor(category: string) {
    if (this.patternCache.has(category)) return this.patternCache.get(category)!;
    const grammarEntry = this.seed.GRAMMAR[category];
    const allPatterns = [...(grammarEntry?.PATTERN ?? []), ...(grammarEntry?.STRUCT ?? [])];
    const compiled = compilePatterns(allPatterns);
    this.patternCache.set(category, compiled);
    return compiled;
  }

  private getLayersFor(category: string) {
    const cached = this.layerCache.get(category);
    if (cached) return cached;
    const compiled = compileSeed(this.seed, category);
    this.layerCache.set(category, compiled);
    return compiled;
  }

  parse(message: string, sender = "", defaultCategory = "GRM_BANK"): MalanaResult {
    // Preserve the existing primary-category routing contract. Composition
    // stays behind this interface so callers never manage grammar candidates.
    const regexTokens = regexTokenize(message, this.currencyRegistry);
    const keywordTokens = this.keywordTokenizer.tokenize(message);
    const tokens = mergeTokens(regexTokens, keywordTokens, message);
    const detectedBankName = detectBank(sender, message);
    const resolvedVendor = extractRawMerchant(message, this.currencyRegistry, detectedBankName);
    const senderGrammar = grammarForSender(sender);
    const requestedCategory = senderGrammar || defaultCategory;
    const recognizedCategory = isMalanaCategory(requestedCategory) ? requestedCategory : null;
    const fallbackCategory: MalanaCategory =
      recognizedCategory && isProductCategory(recognizedCategory) ? recognizedCategory : "GRM_BANK";
    const routedCategory = routePrimaryCategory(tokens, fallbackCategory);
    const spam = detectSpam(message);
    const promotionalLoan = isPromotionalLoanSolicitation(tokens, spam.isSpam);
    const primaryCategory: MalanaCategory = promotionalLoan ? "GRM_OFFERS" : routedCategory;
    const detectedByRouting =
      primaryCategory !== fallbackCategory ||
      (Boolean(senderGrammar) && fallbackCategory !== defaultCategory);
    const candidates = selectCategoryCandidates(tokens, primaryCategory);
    if (hasInactiveTransactionStatus(message, {}) && !candidates.includes("GRM_NOTIF")) {
      candidates.push("GRM_NOTIF");
    }

    const parsedByCategory = new Map<MalanaCategory, ParsedCategory>();
    for (const category of candidates) {
      const parsed = this.parseCategory(
        message,
        sender,
        category,
        category === primaryCategory && detectedByRouting,
        regexTokens,
        keywordTokens,
        tokens,
        detectedBankName,
        resolvedVendor,
        spam,
      );
      parsed.evidence.push(...categoryMarkerEvidence(category, tokens));
      if (category === "GRM_NOTIF" && hasInactiveTransactionStatus(message, parsed.result.tags)) {
        parsed.evidence.push({ kind: "policy", value: "inactive-status" });
      }
      parsedByCategory.set(category, parsed);
    }

    return composeCategoryResults(primaryCategory, candidates, parsedByCategory, tokens);
  }

  private parseCategory(
    message: string,
    sender: string,
    category: MalanaCategory,
    detectedByRouting: boolean,
    regexToks: Token[],
    kwToks: Token[],
    allTokens: Token[],
    detectedBankName: string | null,
    resolvedVendor: string | null,
    spam: { isSpam: boolean; score: number },
  ): ParsedCategory {
    // Step 3: Compile grammar layers for category (cached — see getLayersFor)
    const layers = this.getLayersFor(category);
    // Routing is evidence for the legacy primary category. Additional
    // categories must prove themselves through category-local grammar tags.
    let detectedCategory: string | null = detectedByRouting ? category : null;
    const evidence: MalanaCategoryEvidence[] = [];

    // Step 4: Run grammar FSA passes
    const processed = runGrammar(allTokens, layers);

    // Step 5: Extract result tags
    const tags: Record<string, string> = {};
    const tagCurrencies: Record<string, string> = {};

    for (const token of processed) {
      if (!token.matched) continue;
      const tag = token.values["_tag"];
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
        const trustworthy =
          tag !== "bal" || isBalanceIndicatorPair(token.values, this.balanceIndicatorTypes);
        if (trustworthy) {
          const tagValue = pickTagValue(tag, token.values);
          if (tagValue) {
            tags[tag] = tagValue;
            evidence.push({ kind: "grammar-tag", value: tag });
            delete tagCurrencies[tag];
            if (token.values["currency"]) tagCurrencies[tag] = token.values["currency"];
          }
          if (!detectedCategory) detectedCategory = category;
        }
      }
      for (const [k, v] of Object.entries(token.values)) {
        if (k.startsWith("_") || !v) continue;
        if (k === "amount" && tags["trx"]) continue;
        if ((k === "acc" || k === "instrno") && tags[k]) continue;
        tags[k] = v;
      }
    }

    // ── Fallbacks for common Indian bank SMS patterns ──────────────────────────

    // 1. Direction from unmatched TRX/TRANS tokens (e.g. "debited FOR Rs.X")
    if (!tags["type"]) {
      for (const token of processed) {
        if (token.matched) continue;
        const t = token.values["type"] || token.values["_norm"];
        if (t === "debit" || t === "credit") {
          tags["type"] = t;
          if (!detectedCategory) detectedCategory = category;
          break;
        }
      }
    }

    // 2. INCRDLMT from PREP+AMT pairs (e.g. "debited WITH Rs.5000")
    if (!tags["trx"] && tags["incrdlmt"] && tags["type"]) {
      tags["trx"] = tags["incrdlmt"];
      if (tagCurrencies["incrdlmt"]) tagCurrencies["trx"] = tagCurrencies["incrdlmt"];
      if (!detectedCategory) detectedCategory = category;
    }

    // 3. Transaction amount from first unmatched AMT when direction is known
    if (!tags["trx"] && tags["type"]) {
      for (const token of processed) {
        if (!token.matched && token.type === "AMT") {
          tags["trx"] = token.text || token.raw;
          if (token.values["currency"]) tagCurrencies["trx"] = token.values["currency"];
          if (!detectedCategory) detectedCategory = category;
          break;
        }
      }
    }

    // 4. BAL immediately before unmatched TRX holds the transaction amount
    if (!tags["trx"]) {
      for (let i = 0; i < processed.length - 1; i++) {
        const tok = processed[i]!;
        const nxt = processed[i + 1]!;
        if (tok.matched && tok.type === "BAL" && !nxt.matched) {
          const dir = nxt.values["type"] || nxt.values["_norm"];
          if (dir === "debit" || dir === "credit") {
            const amt = tok.values["amount"];
            if (amt) {
              tags["trx"] = amt;
              if (tok.values["currency"]) tagCurrencies["trx"] = tok.values["currency"];
              if (!tags["type"]) tags["type"] = dir;
              if (!detectedCategory) detectedCategory = category;
              break;
            }
          }
        }
      }
    }

    // 5. Balance-only message: BLNC keyword present but no bal/trx — grab first unmatched AMT as bal
    if (!tags["bal"] && !tags["trx"]) {
      const hasBlnc = kwToks.some((t) => t.type === "BLNC");
      if (hasBlnc) {
        for (const token of processed) {
          if (!token.matched && token.type === "AMT") {
            tags["bal"] = token.text || token.raw;
            if (token.values["currency"]) tagCurrencies["bal"] = token.values["currency"];
            if (!detectedCategory) detectedCategory = category;
            break;
          }
        }
      }
    }

    // 6. MANDATEID — always an unmatched leaf token (no grammar rule consumes it,
    // see regex-tokenizer.ts), so pull its value directly the same way other
    // unmatched-token fallbacks above do.
    if (!tags["mandateid"]) {
      for (const token of processed) {
        if (!token.matched && token.type === "MANDATEID") {
          tags["mandateid"] = token.text || token.raw;
          break;
        }
      }
    }

    // The seed's REFNO grammar accepts REF NUM/NUMBER, but common bank copy
    // inserts the independently-tokenized word "No" (REF NO NUM). Preserve
    // the seed's token vocabulary while bridging that one-token gap so the
    // dashboard can identify duplicate notifications for the same transfer.
    if (!tags["ref"]) {
      for (let i = 0; i < processed.length; i++) {
        if (processed[i]!.type !== "REF") continue;
        const valueIndex = processed[i + 1]?.type === "NO" ? i + 2 : i + 1;
        const valueToken = processed[valueIndex];
        if (valueToken?.type === "NUM" || valueToken?.type === "NUMBER") {
          tags["ref"] = valueToken.text || valueToken.raw;
          break;
        }
      }
    }

    // Step 6: PATTERN/STRUCT extraction — extract named captures (#vendor, #item, etc.)
    const patternCaptures = runPatterns(this.getPatternsFor(category), processed);
    // Merge into tags (don't overwrite grammar-derived values)
    for (const [k, v] of Object.entries(patternCaptures)) {
      if (v && !tags[k]) {
        tags[k] = v;
      }
    }
    // #vendor/#billvendor are the same untrusted free-text capture described
    // below (proven to grab boilerplate like "avoid as per T&C ignore", never
    // a real merchant name) — dropped from the public `vendor` field already.
    // Strip them here too so a consumer reading the raw `tags` map directly
    // can't see the garbled capture that `result.vendor` was fixed to hide.
    delete tags["vendor"];
    delete tags["billvendor"];

    // Step 7: Brand enrichment — check extracted merchant text first, then fall back to raw message
    // Raw-text anchors are the trusted open-vocabulary merchant source.
    // Legacy #vendor/#billvendor captures only see recognized dictionary
    // tokens, so they are deliberately excluded from product output.
    const merchantText = resolvedVendor || tags["bene"] || tags["merchant"] || tags["item"] || "";
    const brandMatch = detectBrand(merchantText) ?? detectBrand(message);

    // Step 8: UPI handle detection — if bene looks like a VPA, confirm handle.
    // No tags["vendor"] fallback: verified against real UPI-with-VPA message
    // shapes ("sent to raju@okhdfcbank", "paid to john@oksbi", etc.) that the
    // #vendor free-text capture never lands on the VPA span itself — it grabs
    // surrounding boilerplate instead — so the fallback was never reachable.
    const vpaText = tags["bene"] || "";
    const upiHandle = detectUpiHandle(vpaText);

    // Step 9: Derived rich fields
    if (hasInactiveTransactionStatus(message, tags)) {
      delete tags["trx"];
      delete tags["type"];
      delete tagCurrencies["trx"];
    }
    const trxTypeRich = deriveRichType(tags, kwToks);
    // A confirmed recharge has its own seed tag (`rechrgsucc`) rather than
    // the generic `trx` tag. Expose that confirmed amount through `trx` too,
    // because budget consumers use `trx` as the common transaction-amount
    // field. Expiry/reminder messages never reach this branch: deriveRichType
    // only returns RECHARGE for a confirmed recharge.
    const transactionAmount =
      tags["trx"] || (trxTypeRich === "RECHARGE" ? tags["rechrgsucc"] : undefined);
    const preferredCurrency = transactionAmount
      ? tags["trx"]
        ? tagCurrencies["trx"]
        : tagCurrencies["rechrgsucc"]
      : tagCurrencies["bal"];
    const currency = detectCurrency(this.currencyRegistry, kwToks, regexToks, preferredCurrency);
    const isFromCard = kwToks.some(
      (t) =>
        t.type === "INS" && ["card", "creditcard", "debitcard"].includes(t.values["_norm"] ?? ""),
    );
    // Only run the mandate merchant/amount extractor when a mandateId is
    // already confirmed present — its "towards X for Y" anchor isn't scoped
    // to mandate messages specifically and could false-match unrelated text.
    const mandateMerchantMatch = tags["mandateid"] ? extractMandateMerchant(message) : null;

    // Build typed result
    const result: MalanaResult = {
      category: detectedCategory,
      tags,
      tokens: processed,

      bankName: detectedBankName,
      merchantCategory: brandMatch?.category ?? detectMerchantCategory(merchantText),
      subcategory: detectSubcategory(tags),

      // Bank fields
      trx: transactionAmount || null,
      bal: tags["bal"] || null,
      acc: tags["acc"] || tags["instrno"] || null,
      trxType: tags["type"] || null,
      trxTypeRich,
      currency,
      isFromCard,
      creditLimit: tags["crdlmt"] || null,
      ref: tags["ref"] || null,
      bene: tags["bene"] || null,
      beneAcc: tags["beneacc"] || null,
      vendor: resolvedVendor,
      location: tags["location"] || detectLocation(message),

      // OTP fields
      otp: tags["otp"] || tags["pin"] || tags["code"] || null,
      otpExpiry: tags["expire"] || null,

      // Travel fields
      pnr: tags["pnr"] || null,
      flight: tags["flt"] || tags["flight_name"] || null,
      departure: tags["dept"] || null,
      arrival: tags["arrv"] || null,
      fare: tags["fare"] || null,
      trainBusNo: tags["train"] || tags["bus"] || null,
      boardingGate: tags["boardgate"] || null,
      departureCode: detectAirports(tags["from_loc"] || "")[0]?.code ?? null,
      arrivalCode: detectAirports(tags["to_loc"] || "")[0]?.code ?? null,

      // Delivery fields
      orderNo: tags["order"] || null,
      trackingId: tags["tracking"] || null,
      deliveryStatus: tags["delivery"] || tags["ordstatus"] || null,
      item: tags["item"] || null,

      // Bill fields
      billAmount: tags["bill"] || null,
      emiAmount: tags["emi"] || null,
      dueDate: tags["due"] || null,
      policyNo: tags["policy"] || null,
      rechargeAmount: tags["rechrg"] || tags["rechrgsucc"] || null,
      mandateAmount: mandateMerchantMatch?.amount || tags["mandate"] || null,
      mandateId: tags["mandateid"] || null,
      mandateEvent: tags["mandateid"]
        ? isMandateCancelled(kwToks)
          ? "cancelled"
          : "active"
        : null,
      mandateMerchant: mandateMerchantMatch?.merchant ?? null,

      // Offer fields
      cashback: tags["cashback"] || null,
      discount: tags["discount"] || null,
      offerCode: tags["code"] || null,
      offerCategory: detectOfferCategory(sender),

      // Telecom fields
      dataLeft: tags["left"] || null,
      packBalance: tags["packbal"] || null,

      // Stocks fields
      navValue: tags["navval"] || null,
      folio: tags["folio"] || null,
      marginAmount: tags["margin"] || null,

      // Brand fields
      brandName: brandMatch?.brand ?? null,
      isOnlineBrand: brandMatch?.isOnline ?? false,

      // UPI
      upiHandle: upiHandle,

      // Spam detection
      isSpam: spam.isSpam,
      spamScore: spam.score,
    };

    return { result, evidence };
  }
}

export type { SeedData, MalanaResult };
