import { Pressable, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AnimatedMoney } from "@/components/animated-money";
import { AppIcon } from "@/components/icon";
import { useThemeColors } from "@/components/ui/theme";

import { scopeLabel, type AnalyticsDirection, type InsightsTimeScope } from "../analytics-scope";
import type { MonthlySpendComparison, MonthlyValue, SpendingPoint } from "../insights-data";
import { InsightsPanel } from "./insights-chrome";
import { ZeeyaAreaChart } from "./zeeya-area-chart";
import { ZeeyaMonthlyBarChart } from "./zeeya-monthly-bar-chart";

function ChartMessage({
  title,
  body,
  onRetry,
}: {
  title: string;
  body: string;
  onRetry?: () => void;
}) {
  const colors = useThemeColors();
  return (
    <View
      accessible
      accessibilityLabel={`${title}. ${body}`}
      style={{
        minHeight: 190,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 16,
        backgroundColor: colors.fill,
        paddingHorizontal: 18,
      }}
    >
      <AppIcon name={onRetry ? "cloud-off" : "chart"} size={22} color={colors.muted} />
      <Text style={{ marginTop: 9, fontSize: 13, fontWeight: "800", color: colors.ink }}>{title}</Text>
      <Text
        style={{ marginTop: 4, fontSize: 12, lineHeight: 18, textAlign: "center", color: colors.muted }}
      >
        {body}
      </Text>
      {onRetry && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry loading analytics chart"
          onPress={onRetry}
          style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 12 }}
        >
          <Text style={{ fontSize: 12, fontWeight: "800", color: colors.accent }}>Try again</Text>
        </Pressable>
      )}
    </View>
  );
}

function DailyChart({
  direction,
  data,
  error,
  onRetry,
}: {
  direction: AnalyticsDirection;
  data: SpendingPoint[];
  error: string | null;
  onRetry: () => void;
}) {
  const colors = useThemeColors();
  if (error) {
    return <ChartMessage title="Daily chart unavailable" body={error} onRetry={onRetry} />;
  }

  if (!data.some((point) => point.value > 0)) {
    return (
      <ChartMessage
        title={`No ${direction === "income" ? "income" : "spending"} captured yet`}
        body="Daily values will appear here after matching transactions are captured."
      />
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={`${direction === "income" ? "Income" : "Spending"} by day for this calendar month`}
    >
      <ZeeyaAreaChart
        key={direction}
        data={data}
        height={190}
        lineColor={direction === "income" ? colors.positive : colors.negative}
        areaStartColor={direction === "income" ? "rgba(18,161,80,0.26)" : "rgba(208,91,81,0.24)"}
        areaEndColor="rgba(0,0,0,0)"
      />
    </View>
  );
}

export function AnalyticsSeriesPanel({
  direction,
  scope,
  comparison,
  currency,
  dailySeries,
  monthlySeries,
  isLoading,
  error,
  onRetry,
}: {
  direction: AnalyticsDirection;
  scope: InsightsTimeScope;
  comparison: MonthlySpendComparison;
  currency: string;
  dailySeries: SpendingPoint[];
  monthlySeries: MonthlyValue[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const colors = useThemeColors();
  const isIncrease = comparison.percentChange !== null && comparison.percentChange > 0;
  const isDecrease = comparison.percentChange !== null && comparison.percentChange < 0;
  const title = direction === "income" ? "Income Analytics" : "Outcome Analytics";
  const scopeDescription =
    scope === "month"
      ? "Daily values · current calendar month"
      : "Monthly values · latest 6 calendar months";

  return (
    <InsightsPanel style={{ marginTop: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: colors.ink }}>{title}</Text>
          <AppIcon name="info" size={15} color={colors.faint} />
        </View>
        <View
          accessible
          accessibilityLabel={`Showing ${scopeLabel(scope)}`}
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
          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.inkSoft }}>
            {scopeLabel(scope)}
          </Text>
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
      <Text style={{ marginTop: 3, fontSize: 12, color: colors.muted }}>
        This month so far compared with this time last month
      </Text>

      <View style={{ marginTop: 15 }}>
        <Text style={{ fontSize: 13, fontWeight: "800", color: colors.ink }}>{scopeDescription}</Text>
        <Text style={{ marginTop: 3, fontSize: 11, color: colors.muted }}>
          {scope === "month"
            ? "A day-by-day view of captured activity"
            : "A bounded trend, not your full transaction history"}
        </Text>
      </View>

      <View style={{ marginTop: 12 }}>
        {isLoading ? null : error ? (
          <ChartMessage title="Chart unavailable" body={error} onRetry={onRetry} />
        ) : scope === "month" ? (
          <DailyChart direction={direction} data={dailySeries} error={null} onRetry={onRetry} />
        ) : (
          <ZeeyaMonthlyBarChart data={monthlySeries} currency={currency} />
        )}
      </View>
    </InsightsPanel>
  );
}
