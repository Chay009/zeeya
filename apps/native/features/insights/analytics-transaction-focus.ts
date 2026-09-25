import type { TransactionFilterChip } from "./analytics-transaction-filters";

export type AnalyticsTransactionFocus = {
  searchQuery: string;
  chip?: TransactionFilterChip;
} | null;

export function categoryTransactionFocus(category: string): AnalyticsTransactionFocus {
  const normalized = category.toLowerCase();
  let chip: TransactionFilterChip | undefined;
  if (normalized.includes("food") || normalized.includes("dining") || normalized.includes("grocery")) {
    chip = "Food";
  } else if (normalized.includes("shop")) {
    chip = "Shopping";
  } else if (
    normalized.includes("transport") ||
    normalized.includes("travel") ||
    normalized.includes("uber") ||
    normalized.includes("ola")
  ) {
    chip = "Transport";
  } else if (normalized.includes("bill")) {
    chip = "Bills";
  }
  return chip ? { searchQuery: "", chip } : { searchQuery: category };
}

export function vendorTransactionFocus(vendor: string): AnalyticsTransactionFocus {
  return { searchQuery: vendor };
}
