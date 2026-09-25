import type { MalanaCategory } from "@zeeya/parser/malana";
import type { ParsedSms } from "./sms";

// The single canonical stored-category tuple — literally declared once,
// here, as the actual source of truth. Every other place this exact
// 10-value set is needed derives FROM this array, never restates it:
// - ProductActivityCategory/ActivityCategoryFilter below (this file's own
//   types)
// - lib/dashboard-data.ts's ActivityCategory (a type alias for
//   ProductActivityCategory)
// - db/schema.ts's Drizzle column enum + activity_category_check CHECK
//   constraint
// - db/projections.ts's isActivityCategory guard (imports this array
//   directly, not a second hand-copied Set)
// - db/queries-home.ts's over-fetch factor (this array's own .length)
// `as const` gives each element its own string-literal type (not widened
// to `string`), which is what makes deriving a union FROM the array's
// element type below possible — this is the type deriving from the value,
// not the other way around (the old `Exclude<MalanaCategory, ...>` typed
// ProductActivityCategory independently of this list, so an eleventh
// MalanaCategory added to the parser would have silently widened the type
// without ever entering this runtime list or the database CHECK).
export const STORED_ACTIVITY_CATEGORIES = [
  "GRM_BANK",
  "GRM_BILL",
  "GRM_STOCKUPDATES",
  "GRM_TRAVEL",
  "GRM_DELIVERY",
  "GRM_EVENT",
  "GRM_APPOINTMENT",
  "GRM_NOTIF",
  "GRM_OTP",
  "GRM_OFFERS",
] as const satisfies readonly MalanaCategory[];

// Derived from STORED_ACTIVITY_CATEGORIES's own element type — the type
// can never list a value the runtime tuple doesn't also carry, and vice
// versa, since there is only one array literal for TypeScript to read
// either from.
export type ProductActivityCategory = (typeof STORED_ACTIVITY_CATEGORIES)[number];

export type ActivityCategoryFilter = "all" | ProductActivityCategory;

export interface ActivityCategoryOption {
  value: ActivityCategoryFilter;
  label: string;
}

// Keyed by ProductActivityCategory itself (derived from STORED_ACTIVITY_
// CATEGORIES's own element type) — a `Record` gives real compile-time
// exhaustiveness: TypeScript rejects this object if it's missing a key
// STORED_ACTIVITY_CATEGORIES carries, or if it has an extra one that isn't
// a real ProductActivityCategory value. A previous version instead
// hand-listed both the value and its label as a second, independently
// enumerated array — nothing stopped that list from silently drifting out
// of sync (missing or duplicate entries still compiled).
const ACTIVITY_CATEGORY_LABELS: Record<ProductActivityCategory, string> = {
  GRM_BANK: "Bank",
  GRM_BILL: "Bills",
  GRM_STOCKUPDATES: "Stocks",
  GRM_TRAVEL: "Travel",
  GRM_DELIVERY: "Delivery",
  GRM_EVENT: "Events",
  GRM_APPOINTMENT: "Appointments",
  GRM_NOTIF: "Alerts",
  GRM_OTP: "OTP",
  GRM_OFFERS: "Offers",
};

// Derived by mapping STORED_ACTIVITY_CATEGORIES itself (plus the "all"
// pseudo-value, which isn't a stored category and so isn't in that tuple or
// ACTIVITY_CATEGORY_LABELS) — this array can never omit or duplicate a
// category the way a second hand-written literal list could.
export const ACTIVITY_CATEGORY_FILTERS: readonly ActivityCategoryOption[] = [
  { value: "all", label: "All" },
  ...STORED_ACTIVITY_CATEGORIES.map((value) => ({
    value,
    label: ACTIVITY_CATEGORY_LABELS[value],
  })),
];

const PRODUCT_CATEGORIES: ReadonlySet<MalanaCategory> = new Set(STORED_ACTIVITY_CATEGORIES);

// Exported so db/projections.ts can reuse this exact predicate instead of
// reconstructing its own PRODUCT_CATEGORIES Set from ACTIVITY_CATEGORY_
// FILTERS a second time.
export function isProductActivityCategory(
  category: MalanaCategory,
): category is ProductActivityCategory {
  return PRODUCT_CATEGORIES.has(category);
}

export function hasVisibleActivityCategory(message: ParsedSms): boolean {
  return message.result.matchedCategories?.some(isProductActivityCategory) ?? false;
}

export function indexActivityByCategory(
  activity: ParsedSms[],
): ReadonlyMap<ActivityCategoryFilter, ParsedSms[]> {
  const index = new Map<ActivityCategoryFilter, ParsedSms[]>(
    ACTIVITY_CATEGORY_FILTERS.map((option) => [option.value, []]),
  );
  for (const message of activity) {
    const categories = message.result.matchedCategories?.filter(isProductActivityCategory);
    if (!categories?.length) continue;
    index.get("all")!.push(message);
    for (const category of categories) {
      index.get(category)?.push(message);
    }
  }
  return index;
}

export function filterActivityByCategory(
  activity: ParsedSms[],
  category: ActivityCategoryFilter,
): ParsedSms[] {
  return indexActivityByCategory(activity).get(category) ?? [];
}
