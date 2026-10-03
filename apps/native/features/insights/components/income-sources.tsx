import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { moneyLabel } from "@/components/ui/money";
import { useThemeColors } from "@/components/ui/theme";
import { fromMinorUnits } from "@/lib/currency";
import type { IncomeSourceComparison } from "@/lib/dashboard-data";
import { moneyFontFamily, moneyTextStyle } from "@/lib/fonts";

import { ProgressRing } from "@/components/charts/progress-ring";

import { merchantLogo, rankColor } from "./analytics-overview";

// Where this month's money came in from: one row per source (an employer,
// a payer, or the income category), its logo inside a ring showing its
// share of the month's income, and its change against the same days last
// month.

export function IncomeSourcesList({
  sources,
  totalMinorUnits,
  currency,
}: {
  sources: readonly IncomeSourceComparison[];
  totalMinorUnits: number;
  currency: string;
}) {
  const colors = useThemeColors();
  if (sources.length === 0) return null;
  return (
    // Sits directly on the sheet (the screen supplies the heading).
    <View>
      {sources.map((source, index) => {
        const amount = moneyLabel(fromMinorUnits(source.currentMinorUnits, currency), currency);
        const share = totalMinorUnits > 0 ? source.currentMinorUnits / totalMinorUnits : 0;
        const change = source.changePercent;
        return (
          <View
            key={source.source}
            accessible
            accessibilityLabel={`${source.source}, ${amount}, ${Math.round(share * 100)}% of income`}
            className="flex-row items-center gap-3 py-3"
            style={index > 0 ? { borderTopWidth: 1, borderTopColor: colors.divider } : undefined}
          >
            <ProgressRing fraction={share} color={rankColor(colors, index)} size={48} stroke={4}>
              {merchantLogo(source.source, 32)}
            </ProgressRing>
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-body font-medium text-ink">
                {source.source}
              </Text>
              <Text className="mt-0.5 text-meta text-muted">
                {source.transactionCount} {source.transactionCount === 1 ? "credit" : "credits"}
                {change !== null && Number.isFinite(change) && Math.round(change) !== 0
                  ? ` · ${change > 0 ? "↑" : "↓"} ${Math.abs(Math.round(change))}% vs last month`
                  : ""}
              </Text>
            </View>
            <View className="items-end">
              <Text
                className="text-ink"
                style={{
                  fontFamily: moneyFontFamily("medium"),
                  fontSize: 15,
                  lineHeight: 20,
                  ...moneyTextStyle,
                }}
              >
                {amount}
              </Text>
              <Text className="text-meta text-muted">{Math.round(share * 100)}%</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
