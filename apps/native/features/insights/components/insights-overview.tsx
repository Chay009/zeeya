import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AnimatedMoney } from "@/components/animated-money";
import { AppIcon } from "@/components/icon";
import { BrandLogo } from "@/features/home-preview/components/brand-logo";
import { SubscriptionSpendValue } from "@/features/home-preview/components/subscription-ui";
import { useThemeColors } from "@/components/ui/theme";
import type { SubscriptionSummary } from "@/lib/dashboard-data";
import { fromMinorUnits } from "@/lib/currency";
import { formatMoney } from "@/features/dashboard/utils/format";

import type { MonthlySpendComparison, SpendingPoint } from "../insights-data";
import { ZeeyaAreaChart } from "./zeeya-area-chart";

const TILE_STYLE = {
  flex: 1,
  minWidth: 0,
  minHeight: 190,
  borderRadius: 22,
  borderWidth: 1,
  padding: 15,
} as const;

function SpendingInsightTile({
  comparison,
  currency,
  series,
  error,
  isLoading,
}: {
  comparison: MonthlySpendComparison;
  currency: string;
  series: SpendingPoint[];
  error: string | null;
  isLoading: boolean;
}) {
  const colors = useThemeColors();
  const hasCurrentSpending = comparison.currentTotal > 0;
  const hasChartData = series.some((point) => point.value > 0);
  const isIncrease = comparison.percentChange !== null && comparison.percentChange > 0;
  const isDecrease = comparison.percentChange !== null && comparison.percentChange < 0;

  return (
    <View style={TILE_STYLE} className="border-border bg-card">
      <Text numberOfLines={2} style={{ fontSize: 13, color: colors.muted }}>
        Spending this month
      </Text>
      <Text
        numberOfLines={1}
        style={{
          marginTop: 5,
          fontSize: 12,
          fontWeight: "700",
          color: isIncrease ? colors.negative : isDecrease ? colors.positive : colors.muted,
        }}
      >
        {comparison.percentChange === null
          ? "No prior month data"
          : `${Math.abs(comparison.percentChange).toFixed(0)}% vs last month`}
      </Text>
      <View style={{ marginTop: 6, minHeight: 28 }}>
        {hasCurrentSpending ? (
          <AnimatedMoney
            value={comparison.currentTotal}
            currency={currency}
            animated={false}
            style={{ fontSize: 20, fontWeight: "800", color: colors.ink }}
          />
        ) : (
          <Text
            numberOfLines={1}
            style={{ fontSize: 20, fontWeight: "800", color: colors.ink }}
          >
            No spending yet
          </Text>
        )}
      </View>
      <View style={{ flex: 1, justifyContent: "flex-end", marginTop: 8 }}>
        {isLoading ? null : error ? (
          <View style={{ height: 74, justifyContent: "center" }}>
            <Text style={{ fontSize: 11, lineHeight: 16, color: colors.muted }}>
              Daily activity is temporarily unavailable.
            </Text>
          </View>
        ) : hasChartData ? (
          <ZeeyaAreaChart
            data={series}
            height={74}
            lineColor={colors.negative}
            areaStartColor="rgba(208,91,81,0.24)"
            areaEndColor="rgba(208,91,81,0.0)"
          />
        ) : (
          <View style={{ height: 74, justifyContent: "center" }}>
            <Text style={{ fontSize: 11, lineHeight: 16, color: colors.muted }}>
              The chart appears after captured expenses.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function SubscriptionsInsightTile({
  subscriptions,
  onOpen,
  committedMonthlySpend,
  committedActiveCount,
}: {
  subscriptions: SubscriptionSummary[];
  onOpen: () => void;
  /** SQL overview values; null keeps a loading/error tile honest. */
  committedMonthlySpend: string | null;
  committedActiveCount: number | null;
}) {
  const colors = useThemeColors();
  const activeItems = useMemo(() => subscriptions, [subscriptions]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = activeItems[Math.min(selectedIndex, Math.max(0, activeItems.length - 1))];

  return (
    <View style={TILE_STYLE} className="border-border bg-card">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open subscriptions"
        onPress={onOpen}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <View
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <Text style={{ fontSize: 13, color: colors.muted }}>Subscriptions</Text>
          <AppIcon name="chevron-right" size={15} color={colors.muted} />
        </View>
        <Text numberOfLines={1} style={{ marginTop: 5, fontSize: 12, color: colors.muted }}>
          {committedActiveCount === null
            ? "Loading captured subscriptions"
            : `${committedActiveCount} active subscription${committedActiveCount === 1 ? "" : "s"}`}
        </Text>
        <SubscriptionSpendValue value={committedMonthlySpend ?? "—"} size={19} />
      </Pressable>

      {activeItems.length > 0 ? (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingTop: 10, paddingBottom: 2, paddingRight: 4 }}
          >
            {activeItems.slice(0, 6).map((subscription, index) => (
              <Pressable
                key={subscription.id}
                accessibilityRole="button"
                accessibilityLabel={`Show ${subscription.merchant}`}
                accessibilityState={{ selected: index === selectedIndex }}
                onPress={() => setSelectedIndex(index)}
                style={{
                  width: 42,
                  height: 72,
                  alignItems: "center",
                  justifyContent: "flex-start",
                  paddingTop: 5,
                  borderTopLeftRadius: 21,
                  borderTopRightRadius: 21,
                  borderBottomLeftRadius: 9,
                  borderBottomRightRadius: 9,
                  backgroundColor: colors.accentSoft,
                  opacity: index === selectedIndex ? 1 : 0.78,
                }}
              >
                <BrandLogo
                  letter={subscription.merchant.charAt(0).toUpperCase() || "?"}
                  tile={colors.accentSoft}
                  ink={colors.accent}
                  size={36}
                  radius={18}
                  iconRatio={0.64}
                />
              </Pressable>
            ))}
          </ScrollView>
          {selected && (
            <View style={{ marginTop: 8, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: "800", color: colors.ink }}>
                {selected.merchant}
              </Text>
              <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 10, color: colors.muted }}>
                {formatMoney(
                  fromMinorUnits(selected.amountMinorUnits, selected.currency),
                  selected.currency,
                )}{" "}
                · {selected.confidence === "likely" ? "Likely recurring" : "Possible recurring"}
              </Text>
            </View>
          )}
        </>
      ) : (
        <Text style={{ marginTop: 14, fontSize: 11, lineHeight: 16, color: colors.muted }}>
          No active subscriptions captured.
        </Text>
      )}
    </View>
  );
}

export function InsightsOverview({
  comparison,
  currency,
  spendingSeries,
  spendingSeriesError,
  subscriptions,
  isLoading,
  onOpenSubscriptions,
  committedMonthlySpend,
  committedActiveCount,
}: {
  comparison: MonthlySpendComparison;
  currency: string;
  spendingSeries: SpendingPoint[];
  spendingSeriesError: string | null;
  subscriptions: SubscriptionSummary[];
  isLoading: boolean;
  onOpenSubscriptions: () => void;
  committedMonthlySpend: string | null;
  committedActiveCount: number | null;
}) {
  const colors = useThemeColors();
  return (
    <View style={{ marginTop: 20 }}>
      <Text style={{ fontSize: 22, fontWeight: "800", letterSpacing: -0.8, color: colors.ink }}>
        Insights
      </Text>
      <View style={{ marginTop: 12, flexDirection: "row", gap: 12 }}>
        <SpendingInsightTile
          comparison={comparison}
          currency={currency}
          series={spendingSeries}
          error={spendingSeriesError}
          isLoading={isLoading}
        />
        <SubscriptionsInsightTile
          subscriptions={subscriptions}
          onOpen={onOpenSubscriptions}
          committedMonthlySpend={committedMonthlySpend}
          committedActiveCount={committedActiveCount}
        />
      </View>
    </View>
  );
}
