import type { MalanaCategory } from "@zeeya/parser/malana";
import type { ParsedSms } from "./sms";

type ProductActivityCategory = Exclude<
  MalanaCategory,
  "GRM_VOID" | "GRM_CALLALERTS" | "GRM_TELECOM"
>;

export type ActivityCategoryFilter = "all" | ProductActivityCategory;

export interface ActivityCategoryOption {
  value: ActivityCategoryFilter;
  label: string;
}

export const ACTIVITY_CATEGORY_FILTERS: readonly ActivityCategoryOption[] = [
  { value: "all", label: "All" },
  { value: "GRM_BANK", label: "Bank" },
  { value: "GRM_BILL", label: "Bills" },
  { value: "GRM_STOCKUPDATES", label: "Stocks" },
  { value: "GRM_TRAVEL", label: "Travel" },
  { value: "GRM_DELIVERY", label: "Delivery" },
  { value: "GRM_EVENT", label: "Events" },
  { value: "GRM_APPOINTMENT", label: "Appointments" },
  { value: "GRM_NOTIF", label: "Alerts" },
  { value: "GRM_OTP", label: "OTP" },
  { value: "GRM_OFFERS", label: "Offers" },
];

const PRODUCT_CATEGORIES: ReadonlySet<MalanaCategory> = new Set(
  ACTIVITY_CATEGORY_FILTERS.flatMap((option) => (option.value === "all" ? [] : [option.value])),
);

function isProductActivityCategory(category: MalanaCategory): category is ProductActivityCategory {
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
