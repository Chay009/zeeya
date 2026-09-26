import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { ProgressBar } from "@/components/ui/controls";
import { DetailRow, RowGroup } from "@/components/ui/list";
import { Money, moneyLabel } from "@/components/ui/money";
import { Section } from "@/components/ui/section";
import { useThemeColors } from "@/components/ui/theme";
import { fromMinorUnits } from "@/lib/currency";

import type { InsightsPresentation } from "../insights-presentation";

// Budget answers one question first — "how much can I still spend?" — then
// shows the pace behind it.

export function AnalyticsBudgetCard({
  budget,
  currency,
}: {
  budget: NonNullable<InsightsPresentation["budget"]>;
  currency: string;
}) {
  const colors = useThemeColors();
  const money = (minor: number) => fromMinorUnits(minor, currency);
  const remaining = money(budget.remainingMinorUnits);
  const over = remaining < 0;
  const projectedOver = budget.projectedMonthSpendMinorUnits > budget.currentMonthBudgetMinorUnits;
  const used = budget.usedPercent / 100;

  return (
    <>
      <View className="rounded-card bg-card p-5">
        <Text className="text-caption font-medium text-muted">{over ? "Over budget by" : "Left to spend"}</Text>
        <Money
          value={Math.abs(remaining)}
          currency={currency}
          size="hero"
          animated
          tone={over ? "negative" : "default"}
          className="mt-1"
        />
        <Text className="mt-1 text-caption text-muted">
          {moneyLabel(money(budget.currentMonthSpentMinorUnits), currency)} of{" "}
          {moneyLabel(money(budget.currentMonthBudgetMinorUnits), currency)} used
        </Text>
        <ProgressBar
          value={used}
          height={8}
          color={over ? colors.negative : used > 0.85 ? colors.warning : colors.chartLine}
          className="mt-5"
        />
        <View className="mt-2 flex-row justify-between">
          <Text className="text-meta text-muted">{Math.round(budget.usedPercent)}% used</Text>
          <Text className="text-meta text-muted">Day {budget.elapsedDays}</Text>
        </View>
      </View>

      <Section title="Pace">
        <RowGroup inset={16}>
          <DetailRow
            label="Projected this month"
            value={moneyLabel(money(budget.projectedMonthSpendMinorUnits), currency)}
            valueClassName={projectedOver ? "text-negative" : ""}
          />
          <DetailRow
            label="Average per day"
            value={moneyLabel(money(budget.averageDailySpendMinorUnits), currency)}
          />
          <DetailRow
            label="Daily allowance"
            value={moneyLabel(money(budget.dailyBudgetMinorUnits), currency)}
          />
          <DetailRow
            label="Days within budget"
            value={`${budget.daysWithinBudget} of ${budget.elapsedDays}`}
          />
        </RowGroup>
      </Section>
    </>
  );
}
