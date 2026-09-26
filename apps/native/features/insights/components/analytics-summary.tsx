import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AnimatedMoney } from "@/components/animated-money";
import { AppIcon } from "@/components/icon";
import { useThemeColors } from "@/components/ui/theme";

import type { AnalyticsDirection } from "../analytics-scope";
import type { MonthlySpendComparison, MonthlyValue } from "../insights-data";
import { InsightsPanel } from "./insights-chrome";
import { ZeeyaMonthlyBarChart } from "./zeeya-monthly-bar-chart";

export function AnalyticsSummary({
  direction,
  comparison,
  currency,
  monthlySeries,
  isLoading,
}: {
  direction: AnalyticsDirection;
  comparison: MonthlySpendComparison;
  currency: string;
  monthlySeries: MonthlyValue[];
  isLoading: boolean;
}) {
  const colors = useThemeColors();
  const isIncrease = comparison.percentChange !== null && comparison.percentChange > 0;
  const isDecrease = comparison.percentChange !== null && comparison.percentChange < 0;
  const title = direction === "income" ? "Income Analytics" : "Outcome Analytics";

  return (
    <InsightsPanel style={{ marginTop: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: colors.ink }}>{title}</Text>
          <AppIcon name="info" size={15} color={colors.faint} />
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: 10,
            paddingVertical: 7,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.inkSoft }}>6 months</Text>
        </View>
      </View>

      <View style={{ marginTop: 17, flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        {isLoading ? (
          <Text style={{ fontSize: 28, fontWeight: "800", letterSpacing: -1.4, color: colors.ink }}>
            —
          </Text>
        ) : (
          <AnimatedMoney
            key={direction}
            value={comparison.currentTotal}
            currency={currency}
            animated={false}
            style={{ fontSize: 28, fontWeight: "800", letterSpacing: -1.4, color: colors.ink }}
          />
        )}
        {comparison.percentChange !== null && (
          <Text
            style={{
              fontSize: 12,
              fontWeight: "800",
              color: isIncrease ? colors.negative : isDecrease ? colors.positive : colors.muted,
            }}
          >
            {isIncrease ? "↗" : isDecrease ? "↘" : "→"}{" "}
            {Math.abs(comparison.percentChange).toFixed(1)}%
          </Text>
        )}
      </View>
      {comparison.percentChange !== null && (
        <Text style={{ marginTop: 3, fontSize: 12, color: colors.muted }}>
          compared with the previous month
        </Text>
      )}
      <View style={{ marginTop: 14 }}>
        <ZeeyaMonthlyBarChart data={monthlySeries} currency={currency} isLoading={isLoading} />
      </View>
    </InsightsPanel>
  );
}
