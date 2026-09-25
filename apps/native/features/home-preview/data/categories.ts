import { fromMinorUnits } from "../../../lib/currency";
import type { CategoryTotal } from "../../../lib/dashboard-data";
import { transactionCategoryLabel } from "../../../lib/transaction-category";
import { formatMoney } from "../../dashboard/utils/format";
import type { CategorySummary } from "./types";
import { visualStyleFor } from "./visual";

export function buildCategoriesFromAggregate(rows: CategoryTotal[], currency: string): CategorySummary[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const label = transactionCategoryLabel(row.category, null);
    totals.set(label, (totals.get(label) ?? 0) + fromMinorUnits(row.totalMinorUnits, currency));
  }
  const total = [...totals.values()].reduce((sum, amount) => sum + amount, 0);
  return [...totals.entries()]
    .sort(([, left], [, right]) => right - left)
    .map(([label, amount]) => {
      const style = visualStyleFor(label, label);
      return {
        label,
        amount: formatMoney(amount, currency),
        color: style.bar,
        pct: total === 0 ? 0 : Math.round((amount / total) * 100),
      };
    });
}

