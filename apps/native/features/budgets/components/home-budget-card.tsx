import { useRouter } from "expo-router";

import { moneyLabel } from "@/components/ui/money";
import { BudgetCard } from "@/features/home-preview/components/budget-card";
import { fromMinorUnits } from "@/lib/currency";

import { useBudgets } from "../hooks/use-budgets";
import { BUDGETS_ROUTE } from "../routes";

/**
 * Home's budget card. With budgets set it shows spend in the budgeted
 * categories against their total — never all spending against a partial
 * limit. Without any, it shows the month's spending and invites setting
 * some. Either way a tap opens Budgets.
 */
export function HomeBudgetCard({
  currency,
  monthLabel,
  monthSpent,
}: {
  currency: string;
  monthLabel: string;
  /** All spending this month, for the no-budgets state. */
  monthSpent: string;
}) {
  const router = useRouter();
  const { summary } = useBudgets(currency);
  const open = () => router.push(BUDGETS_ROUTE);

  if (!summary) {
    return (
      <BudgetCard
        monthLabel={monthLabel}
        spent={monthSpent}
        limit={null}
        usedPercent={null}
        remaining={null}
        onOpen={open}
      />
    );
  }

  const label = (minorUnits: number) => moneyLabel(fromMinorUnits(minorUnits, currency), currency);
  const left = summary.limitMinorUnits - summary.spentMinorUnits;
  return (
    <BudgetCard
      monthLabel={`${monthLabel || "This month"} · ${summary.count} ${summary.count === 1 ? "budget" : "budgets"}`}
      spent={label(summary.spentMinorUnits)}
      limit={label(summary.limitMinorUnits)}
      usedPercent={Math.round(summary.used * 100)}
      remaining={left > 0 ? label(left) : null}
      status={
        summary.overCount > 0
          ? `${summary.overCount} over budget`
          : summary.watchCount > 0
            ? `${summary.watchCount} to watch`
            : null
      }
      statusTone={summary.overCount > 0 ? "negative" : "warning"}
      onOpen={open}
    />
  );
}
