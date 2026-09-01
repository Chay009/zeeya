import type {
  MalanaCategory,
  MalanaCategoryEvidence,
  MalanaCategoryMatch,
  MalanaCategoryRole,
  MalanaResult,
  SeedData,
  Token,
} from "./types";

interface CategoryPolicy {
  role: MalanaCategoryRole;
  productVisible: boolean;
  primaryMarkers?: readonly string[];
  blockedByMarkers?: readonly string[];
  candidateMarkers?: readonly string[];
  strongMarkers?: readonly string[];
  evidenceTags?: readonly string[];
  retainedTags?: readonly string[];
}

const BANK_EVIDENCE = [
  "acc",
  "bal",
  "bene",
  "beneacc",
  "bentrx",
  "crdlmt",
  "equity",
  "ref",
  "subsidy",
  "trx",
  "waladd",
  "walsub",
] as const;
const BILL_MARKERS = [
  "AUTDBT",
  "BILL",
  "DUE",
  "EMI",
  "MANDATE",
  "POLICY",
  "PREMIUM",
  "RECHRG",
  "RENTAL",
] as const;
const BILL_EVIDENCE = [
  "bill",
  "billno",
  "due",
  "emi",
  "mandate",
  "mandateid",
  "policy",
  "recharge",
  "rechrg",
  "rechrginit",
  "rechrgnumexp",
  "rechrgnumsucc",
  "rechrgsucc",
] as const;

/** One source for routing, activation, evidence, output filtering, and product visibility. */
const CATEGORY_POLICIES: Record<MalanaCategory, CategoryPolicy> = {
  GRM_BANK: {
    role: "financial",
    productVisible: true,
    candidateMarkers: ["ATM", "ATMWDL", "AVBL", "BLNC", "RECEIVE", "SEND", "TRANS", "TRX"],
    evidenceTags: BANK_EVIDENCE,
  },
  GRM_BILL: {
    role: "financial",
    productVisible: true,
    candidateMarkers: BILL_MARKERS,
    evidenceTags: BILL_EVIDENCE,
    retainedTags: ["amount", "billvendor", "consumer", "currency", "mobile"],
  },
  GRM_STOCKUPDATES: {
    role: "financial",
    productVisible: true,
    primaryMarkers: ["STOCKEXCHNG", "STOCKTRADE", "STOCKUNITS", "NAV", "FOLIO"],
    candidateMarkers: ["STOCKEXCHNG", "STOCKTRADE", "STOCKUNITS", "NAV", "FOLIO", "MUTUALFUND"],
    strongMarkers: ["STOCKEXCHNG", "STOCKTRADE", "STOCKUNITS", "NAV", "FOLIO"],
    evidenceTags: [
      "balunits",
      "folio",
      "margin",
      "navval",
      "redemption",
      "stockunits",
      "tradedt",
      "unit",
    ],
  },
  GRM_TRAVEL: {
    role: "information",
    productVisible: true,
    primaryMarkers: [
      "FLIGHT",
      "PNR",
      "TICKET",
      "TICKETNO",
      "TRIPCODE",
      "BUSNO",
      "BOOKINGID",
      "MTICKET",
      "FLTID",
    ],
    candidateMarkers: [
      "FLIGHT",
      "PNR",
      "TICKET",
      "TICKETNO",
      "TRIPCODE",
      "BUSNO",
      "BOOKINGID",
      "MTICKET",
      "FLTID",
      "TRAIN",
    ],
    strongMarkers: ["FLIGHT", "PNR", "TRIPCODE", "BUSNO", "MTICKET", "FLTID", "TRAIN"],
    evidenceTags: [
      "alert",
      "arrv",
      "boardgate",
      "boardpass",
      "booking",
      "bus",
      "cab",
      "dept",
      "fare",
      "flt",
      "fltalert",
      "itinalert",
      "order",
      "orgfare",
      "pnr",
      "ref",
      "rprt",
      "tele",
      "terminal",
      "ticket",
      "train",
      "trip",
      "wbcheck",
      "webchckin",
    ],
    retainedTags: ["from_loc", "to_loc", "vendor", "location"],
  },
  GRM_DELIVERY: {
    role: "information",
    productVisible: true,
    primaryMarkers: ["ORDERID", "TRACKINGID", "ORDER", "TRACK"],
    candidateMarkers: ["ORDERID", "TRACKINGID", "ORDER", "TRACK", "DELIVERY"],
    strongMarkers: ["ORDERID", "ORDERIDVAL", "TRACKINGID", "TRACK", "DELIVERY"],
    evidenceTags: [
      "acknwlg",
      "agentpin",
      "bldart",
      "bookarticle",
      "cancel",
      "delay",
      "delivery",
      "managedlvry",
      "order",
      "ordnotif",
      "prev",
      "receipt",
      "tele",
      "trackdlvry",
      "tracking",
      "undelivrd",
    ],
    retainedTags: ["item", "vendor"],
  },
  GRM_EVENT: {
    role: "information",
    productVisible: true,
    primaryMarkers: ["SEAT", "SHOWS", "VACCINATION", "RTPCR"],
    blockedByMarkers: ["FLIGHT", "PNR", "TRIPCODE", "BUSNO", "MTICKET", "FLTID", "TRAIN"],
    candidateMarkers: ["TICKET", "TICKETNO", "SEAT", "SHOWS", "VACCINATION", "RTPCR"],
    strongMarkers: ["SEAT", "SHOWS", "VACCINATION", "RTPCR"],
    evidenceTags: ["appntmnt", "booking", "rtpcr", "vaccine", "vaccinepin", "vaxxnorig"],
    retainedTags: ["date", "time", "id"],
  },
  GRM_APPOINTMENT: {
    role: "information",
    productVisible: true,
    primaryMarkers: ["APPOINTMENT", "APPOINTMENTID"],
    candidateMarkers: ["APPOINTMENT", "APPOINTMENTID", "APPNTMENT"],
    strongMarkers: ["APPOINTMENT", "APPOINTMENTID"],
    retainedTags: ["date", "time", "id"],
  },
  GRM_NOTIF: {
    role: "safety",
    productVisible: true,
    candidateMarkers: ["DECLINE", "DECLINE1", "INSUFFUNDS", "RESCHE"],
    strongMarkers: ["DECLINE", "DECLINE1", "INSUFFUNDS", "RESCHE"],
    evidenceTags: [
      "autpaydecline",
      "checkfraud",
      "chqclr",
      "conv",
      "decline",
      "exceed",
      "futrefund",
      "init",
      "limit",
      "login",
      "mngdata",
      "overdrawn",
      "penalty",
      "request",
      "trxfailed",
      "unknown",
      "validtill",
      "willcharge",
    ],
  },
  GRM_OTP: {
    role: "safety",
    productVisible: true,
    primaryMarkers: ["OTP", "PINCODE"],
    candidateMarkers: ["OTP", "PINCODE"],
    strongMarkers: ["OTP", "PINCODE"],
    evidenceTags: ["agentpin", "card", "code", "delivery", "expire", "otp", "pin", "possible"],
  },
  GRM_OFFERS: {
    role: "safety",
    productVisible: true,
    primaryMarkers: ["OFFER", "OFFERSINTRX", "OFFERCODE", "USECODE", "OFFERS"],
    candidateMarkers: ["OFFER", "OFFERSINTRX", "OFFERCODE", "USECODE", "OFFERS"],
    strongMarkers: ["OFFER", "OFFERSINTRX", "OFFERCODE", "USECODE", "OFFERS"],
    evidenceTags: [
      "benefit",
      "cashback",
      "code",
      "discount",
      "emi",
      "expire",
      "moneyinkind",
      "offer",
      "rechrgtoget",
      "save",
      "trx",
      "value",
      "walletoffer",
      "worth",
    ],
  },
  GRM_TELECOM: { role: "information", productVisible: false },
  GRM_CALLALERTS: { role: "internal", productVisible: false },
  GRM_VOID: { role: "internal", productVisible: false },
};

const CATEGORY_ORDER = Object.keys(CATEGORY_POLICIES) as MalanaCategory[];
const PRIMARY_PRIORITY: readonly MalanaCategory[] = [
  "GRM_OTP",
  "GRM_APPOINTMENT",
  "GRM_EVENT",
  "GRM_TRAVEL",
  "GRM_DELIVERY",
  "GRM_OFFERS",
  "GRM_STOCKUPDATES",
];

export function routePrimaryCategory(tokens: Token[], fallback: MalanaCategory): MalanaCategory {
  const types = new Set(tokens.map((token) => token.type));
  return (
    PRIMARY_PRIORITY.find((category) => {
      const policy = CATEGORY_POLICIES[category];
      const blocked = policy.blockedByMarkers?.some((marker) => types.has(marker)) ?? false;
      return !blocked && policy.primaryMarkers?.some((marker) => types.has(marker));
    }) ?? fallback
  );
}

/** The seed separates ambiguous bare/noun forms in TRX1 from completed forms in TRX/TRX2. */
export function deriveAmbiguousTransactionForms(seed: SeedData): ReadonlySet<string> {
  const entry = Object.entries(seed.TOKENS).find(([key]) => /^TRX1(?:\[|$)/.test(key));
  if (!entry) return new Set();
  return new Set(
    entry[1]
      .split(",")
      .map((value) => value.split("|", 1)[0]!.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * The tokenizer intentionally collapses TRX1 to the base TRX type, matching
 * Java, and consequently inherits the seed's shared `past` annotation. A
 * promotional message containing only one of those ambiguous forms is not a
 * completed transaction unless transaction-reference or reported-balance
 * evidence backs it independently. An account number identifies the subject,
 * but does not prove that the instructed movement happened.
 */
export function isUnconfirmedPromotionalTransaction(
  tokens: Token[],
  isSpam: boolean,
  ambiguousForms: ReadonlySet<string>,
  balanceIndicatorTypes: ReadonlySet<string>,
): boolean {
  if (!isSpam) return false;
  const hasAmbiguousTransaction = tokens.some(
    (token) => token.type === "TRX" && ambiguousForms.has(token.text.trim().toLowerCase()),
  );
  if (!hasAmbiguousTransaction) return false;

  const hasIndependentCompletionEvidence = tokens.some(
    (token) =>
      token.type === "REF" || token.type === "TRANSID" || balanceIndicatorTypes.has(token.type),
  );
  return !hasIndependentCompletionEvidence;
}

export function qualifyCategoryEvidence(
  category: MalanaCategory,
  evidence: MalanaCategoryEvidence[],
  tokens: Token[],
): MalanaCategoryEvidence[] {
  const policy = CATEGORY_POLICIES[category];
  if (!policy.productVisible) return [];
  if (category === "GRM_BILL") {
    const hasBillMarker = tokens.some((token) =>
      BILL_MARKERS.some((marker) => marker === token.type),
    );
    if (!hasBillMarker && !hasGrammarEvidence(evidence, "rechrgsucc")) return [];
  }
  return evidence.filter(
    (item) =>
      item.kind === "marker" ||
      item.kind === "policy" ||
      (policy.evidenceTags?.includes(item.value) ?? false),
  );
}

export function hasGrammarEvidence(evidence: MalanaCategoryEvidence[], tag: string): boolean {
  return evidence.some((item) => item.kind === "grammar-tag" && item.value === tag);
}

export function isMalanaCategory(value: string): value is MalanaCategory {
  return Object.hasOwn(CATEGORY_POLICIES, value);
}

export function isProductCategory(category: MalanaCategory): boolean {
  return CATEGORY_POLICIES[category].productVisible;
}

export function categoryRole(category: MalanaCategory): MalanaCategoryRole {
  return CATEGORY_POLICIES[category].role;
}

export function categoryMarkerEvidence(
  category: MalanaCategory,
  tokens: Token[],
): MalanaCategoryEvidence[] {
  const markers = CATEGORY_POLICIES[category].strongMarkers;
  if (!markers) return [];
  return [
    ...new Set(tokens.filter((token) => markers.includes(token.type)).map((token) => token.type)),
  ]
    .sort()
    .map((value) => ({ kind: "marker" as const, value }));
}

export function selectCategoryCandidates(
  tokens: Token[],
  primary: MalanaCategory,
): MalanaCategory[] {
  const tokenTypes = new Set(tokens.map((token) => token.type));
  const selected = new Set<MalanaCategory>([primary]);
  if (categoryRole(primary) !== "safety") {
    const hasBillSignal = BILL_MARKERS.some((type) => tokenTypes.has(type));
    if (primary === "GRM_BILL" || hasBillSignal) selected.add("GRM_BILL");
  }
  for (const category of CATEGORY_ORDER) {
    if (category === "GRM_BILL") continue;
    const markers = CATEGORY_POLICIES[category].candidateMarkers;
    if (markers?.some((marker) => tokenTypes.has(marker))) selected.add(category);
  }
  return [primary, ...CATEGORY_ORDER].filter(
    (category, index, ordered) => selected.has(category) && ordered.indexOf(category) === index,
  );
}

export function createCategoryMatch(
  category: MalanaCategory,
  result: MalanaResult,
  evidence: MalanaCategoryEvidence[],
): MalanaCategoryMatch {
  const unique = new Map(evidence.map((item) => [`${item.kind}:${item.value}`, item]));
  return {
    category,
    role: categoryRole(category),
    evidence: [...unique.values()].sort(
      (a, b) => a.kind.localeCompare(b.kind) || a.value.localeCompare(b.value),
    ),
    tags: filterCategoryTags(category, result.tags),
  };
}

function filterCategoryTags(
  category: MalanaCategory,
  tags: Record<string, string>,
): Record<string, string> {
  if (category === "GRM_BANK") return { ...tags };
  const policy = CATEGORY_POLICIES[category];
  const retained = new Set([...(policy.evidenceTags ?? []), ...(policy.retainedTags ?? [])]);
  if (policy.role !== "safety") {
    retained.add("amount");
    retained.add("currency");
  } else {
    retained.delete("trx");
    retained.delete("type");
    retained.delete("amount");
    retained.delete("currency");
  }
  return Object.fromEntries(Object.entries(tags).filter(([key]) => retained.has(key)));
}
