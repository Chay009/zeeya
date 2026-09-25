import type { InsightsTransactionRow } from "./insights-transaction-presentation";

export const TRANSACTION_FILTER_CHIPS = [
  "All",
  "Food",
  "Shopping",
  "Transport",
  "Bills",
] as const;

export type TransactionFilterChip = (typeof TRANSACTION_FILTER_CHIPS)[number];

export function transactionMatchesFilter(
  item: InsightsTransactionRow,
  filter: TransactionFilterChip,
): boolean {
  if (filter === "All") return true;
  const haystack = `${item.name} ${item.category} ${item.sub}`.toLowerCase();
  if (filter === "Food") {
    return (
      haystack.includes("food") ||
      haystack.includes("dining") ||
      haystack.includes("grocery") ||
      haystack.includes("restaurant") ||
      haystack.includes("swiggy") ||
      haystack.includes("zomato")
    );
  }
  if (filter === "Shopping") {
    return (
      haystack.includes("shop") ||
      haystack.includes("amazon") ||
      haystack.includes("flipkart") ||
      haystack.includes("myntra")
    );
  }
  if (filter === "Transport") {
    return (
      haystack.includes("uber") ||
      haystack.includes("ola") ||
      haystack.includes("transport") ||
      haystack.includes("fuel") ||
      haystack.includes("metro")
    );
  }
  if (filter === "Bills") {
    return (
      haystack.includes("bill") ||
      haystack.includes("recharge") ||
      haystack.includes("electric") ||
      haystack.includes("broadband")
    );
  }
  return true;
}
