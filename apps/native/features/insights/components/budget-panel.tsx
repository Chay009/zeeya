import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { formatMoney } from "@/features/dashboard/utils/format";
import { fromMinorUnits } from "@/lib/currency";
import { moneyFontFamily } from "@/lib/fonts";

import type { InsightsPresentation } from "../insights-presentation";
import { AnalyticsCard } from "./analytics-card";

export function BudgetPanel({
  budget,
  currency,
}: {
  budget: NonNullable<InsightsPresentation["budget"]>;
  currency: string;
}) {
  return (
    <AnalyticsCard>
      <Text className="text-[13px] font-semibold tracking-wide text-muted">Budget</Text>
      <Text
        className="mt-2 text-display font-bold tracking-tighter text-ink"
        style={{ fontFamily: moneyFontFamily("bold") }}
      >
        {budget.adherenceScore}%
      </Text>
      <Text className="mt-1 text-[13px] text-muted">on track this month</Text>

      <View className="mt-[22px] h-2 overflow-hidden rounded-pill bg-fill-strong">
        <View
          className="h-full rounded-pill bg-accent"
          style={{ width: `${Math.min(100, Math.max(0, budget.usedPercent))}%` }}
        />
      </View>
      <Text className="mt-2.5 text-[13px] text-ink-soft">
        {formatMoney(fromMinorUnits(budget.currentMonthSpentMinorUnits, currency), currency)} of{" "}
        {formatMoney(fromMinorUnits(budget.currentMonthBudgetMinorUnits, currency), currency)}
      </Text>
      <Text className="mt-1 text-caption text-muted">
        Projected {formatMoney(fromMinorUnits(budget.projectedMonthSpendMinorUnits, currency), currency)}
        {budget.daysOverBudget > 0
          ? ` · ${budget.daysOverBudget} day${budget.daysOverBudget === 1 ? "" : "s"} over`
          : ""}
      </Text>
    </AnalyticsCard>
  );
}
