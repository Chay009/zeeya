import { Pressable, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { MoneyText } from "@/components/native-ui/money-text";
import { useThemeColors } from "@/components/ui/theme";
import { formatMoney } from "@/features/dashboard/utils/format";

import { analyticsOverviewHeadline } from "../analytics-format";
import type { AnalyticsDirection, AnalyticsTab, InsightsTimeScope } from "../analytics-scope";
import { analyticsTabTheme, formatComparisonDelta } from "../analytics-tab-theme";
import type { MonthlySpendComparison, MonthlyValue, SpendingPoint } from "../insights-data";
import { AnalyticsCard } from "./analytics-card";
import { ZeeyaAreaChart } from "./zeeya-area-chart";
import { ZeeyaMonthlyBarChart } from "./zeeya-monthly-bar-chart";

function ChartFallback({
  title,
  body,
  onRetry,
}: {
  title: string;
  body: string;
  onRetry?: () => void;
}) {
  return (
    <View className="min-h-[160px] justify-center py-6">
      <Text className="text-body font-bold text-ink">{title}</Text>
      <Text className="mt-1 text-caption leading-[18px] text-muted">{body}</Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry loading analytics chart"
          onPress={onRetry}
          className="mt-3 min-h-11 justify-center self-start"
        >
          <Text className="text-caption font-bold text-accent-deep">Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function AnalyticsOverviewCard({
  tab,
  direction,
  scope,
  comparison,
  currency,
  dailySeries,
  monthlySeries,
  error,
  onRetry,
  at,
}: {
  tab: AnalyticsTab;
  direction: AnalyticsDirection;
  scope: InsightsTimeScope;
  comparison: MonthlySpendComparison;
  currency: string;
  dailySeries: SpendingPoint[];
  monthlySeries: MonthlyValue[];
  error: string | null;
  onRetry: () => void;
  at: Date;
}) {
  const colors = useThemeColors();
  const theme = analyticsTabTheme(tab, colors);
  const hasDaily = dailySeries.some((point) => point.value > 0);
  const hasMonthly = monthlySeries.some((point) => point.value > 0);
  const deltaLabel = formatComparisonDelta(comparison.percentChange);
  const activeBarColor = direction === "income" ? colors.positive : colors.negative;

  return (
    <AnalyticsCard>
      <MoneyText weight="bold" className="text-hero font-extrabold tracking-tighter text-ink">
        {formatMoney(comparison.currentTotal, currency)}
      </MoneyText>
      <Text className="mt-1 text-subtitle text-muted">{analyticsOverviewHeadline(tab)}</Text>
      {deltaLabel ? (
        <Text className={`mt-2 text-caption font-bold ${theme.deltaTextClass(comparison.percentChange)}`}>
          {deltaLabel}
        </Text>
      ) : null}

      <View className="mt-6">
        {error ? (
          <ChartFallback title="Chart unavailable" body={error} onRetry={onRetry} />
        ) : scope === "month" && hasDaily ? (
          <ZeeyaAreaChart
            data={dailySeries}
            height={188}
            lineColor={theme.lineColor}
            areaStartColor={theme.areaStartColor}
            areaEndColor={theme.areaEndColor}
            showAxes
            currency={currency}
            at={at}
          />
        ) : scope !== "month" && hasMonthly ? (
          <ZeeyaMonthlyBarChart
            data={monthlySeries}
            currency={currency}
            activeBarColor={activeBarColor}
          />
        ) : (
          <ChartFallback
            title="Nothing in this period yet"
            body="The chart fills in once captured transactions land in this range."
          />
        )}
      </View>
    </AnalyticsCard>
  );
}
