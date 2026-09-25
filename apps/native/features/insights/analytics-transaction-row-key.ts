import type { InsightsTransactionRow } from "./insights-transaction-presentation";

/** Stable list keys even when the backing id repeats across pages or groups. */
export function analyticsTransactionRowKey(
  item: InsightsTransactionRow,
  index: number,
  groupKey = "preview",
): string {
  return `${groupKey}:${item.key}:${item.date}:${index}`;
}
