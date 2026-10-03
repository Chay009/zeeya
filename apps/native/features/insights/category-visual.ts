import type { AppIconName } from "@/components/icon";

// The icon a category falls back to while its art is missing — keyed by the
// art piece, so the label is classified once (CATEGORY_ART below) and the
// icon can never disagree with the art.
const ART_ICON: Record<string, AppIconName> = {
  "cat-food": "food",
  "cat-groceries": "cart",
  "cat-travel": "airplane",
  "cat-fuel": "fuel",
  "cat-transport": "car",
  "cat-shopping": "bag",
  "cat-entertainment": "film",
  "cat-bills": "receipt",
  "cat-invest": "trend-up",
  "cat-health": "health",
  "cat-home": "home",
  "cat-electronics": "flash",
  "cat-education": "school",
  "cat-transfer": "swap",
  "cat-cash": "rupee-receipt",
  "cat-emi": "calendar",
  "cat-cashback": "reload",
  "cat-other": "pie-chart",
};

export function categoryIcon(label: string): AppIconName {
  return ART_ICON[categoryArt(label)] ?? "pie-chart";
}

// Category label → art piece (assets/art/CATALOG.md). Labels are the parser's
// merchant categories and transaction types, title-cased by
// lib/transaction-category.ts ("Food", "E-Commerce", "Upi", "Atm", ...).
// Order matters: the first match wins.
const CATEGORY_ART: [RegExp, string][] = [
  [/cashback|refund/i, "cat-cashback"],
  [/withdraw|\batm\b|^cash$/i, "cat-cash"],
  [/\bemi\b|autdbt|loan|nach/i, "cat-emi"],
  [/transfer|\bupi\b|neft|imps|rtgs|aeps|p2p|wallet/i, "cat-transfer"],
  [/grocer|supermarket|kirana|\bmart\b/i, "cat-groceries"],
  [/food|dining|restaurant|hospitality|wine|cafe|swiggy|zomato/i, "cat-food"],
  [/fuel|petrol/i, "cat-fuel"],
  [/travel|railway|flight|\bair|hotel|trip|irctc/i, "cat-travel"],
  [/automobile|transport|cab|taxi|uber|ola|metro/i, "cat-transport"],
  [/electronic|gadget/i, "cat-electronics"],
  [/shop|commerce|fashion|apparel|cosmetic|salon/i, "cat-shopping"],
  [/entertain|movie|ott|stream|subscri/i, "cat-entertainment"],
  [/monetary|invest|mutual|\bsip\b|insurance|stock/i, "cat-invest"],
  [/communication|bill|utilit|electric|recharge|mobile|internet|payments/i, "cat-bills"],
  [/medic|health|\blab\b|pharma|hospital|fitness/i, "cat-health"],
  [/household|hardware|rent|home|house|furnish/i, "cat-home"],
  [/stationary|stationery|publish|educat|school|course|book/i, "cat-education"],
];

export function categoryArt(label: string): string {
  return CATEGORY_ART.find(([pattern]) => pattern.test(label))?.[1] ?? "cat-other";
}

// Each art piece sits on a soft field of its own hue (the colour the object
// itself leans on), so a row of categories reads apart before any label.
// Used at low alpha, which works on both the light and the dark card.
const ART_TINT: Record<string, string> = {
  "cat-food": "#F5A524",
  "cat-groceries": "#84CC16",
  "cat-travel": "#3B82F6",
  "cat-fuel": "#22C55E",
  "cat-transport": "#0EA5E9",
  "cat-shopping": "#F472B6",
  "cat-entertainment": "#F43F5E",
  "cat-bills": "#8B5CF6",
  "cat-invest": "#10B981",
  "cat-health": "#EF4444",
  "cat-home": "#F97316",
  "cat-electronics": "#6366F1",
  "cat-education": "#EAB308",
  "cat-transfer": "#06B6D4",
  "cat-cash": "#A855F7",
  "cat-emi": "#64748B",
  "cat-cashback": "#14B8A6",
  "cat-other": "#64748B",
};

// Pieces drawn mostly in cream/white (receipt, tag, capsule) vanish on a
// faint field, so theirs is stronger.
const PALE_ART = new Set(["cat-bills", "cat-other", "cat-health"]);

/** The category's own hue: its tile field, its share-bar segment. */
export function categoryTint(label: string): string {
  return ART_TINT[categoryArt(label)] ?? ART_TINT["cat-other"];
}

/** How strongly a tile lays that hue under the art. */
export function categoryTintAlpha(label: string, isDark: boolean): number {
  const base = isDark ? 0.18 : 0.14;
  return PALE_ART.has(categoryArt(label)) ? base + 0.08 : base;
}

export function categoryColor(chart: readonly string[], index: number): string {
  return chart[index % chart.length] ?? chart[0] ?? "#888";
}
