import type { ActivityRowPresentation } from "@/features/home-preview/data/types";
import { hp } from "@/features/home-preview/theme";

import type { AnalyticsDirection } from "./analytics-scope";
import type { InsightsTransactionRow } from "./insights-transaction-presentation";

/** Maps analytics transaction rows into Home's shared activity row presentation. */
export function mapInsightsTransactionToActivityRow(
  item: InsightsTransactionRow,
  direction: AnalyticsDirection,
): ActivityRowPresentation {
  const flow = direction === "income" ? "income" : "expense";
  return {
    key: item.key,
    letter: item.letter,
    tile: item.tile,
    ink: item.ink,
    img: item.img ?? undefined,
    bar: flow === "income" ? hp.positive : hp.coral,
    name: item.name,
    sub: item.sub,
    amount: item.amount,
    direction: flow,
    categoryFilters: [],
    categorySuggestions: item.category
      ? [{ key: item.category, label: item.category }]
      : [],
    pills: [],
  };
}
