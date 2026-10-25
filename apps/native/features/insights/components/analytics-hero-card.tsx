import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { AppText as Text } from "@/components/app-text";
import { BarChart } from "@/components/charts/bar-chart";
import { AppIcon } from "@/components/icon";
import { DeltaChip, Segmented } from "@/components/ui/controls";
import { useCardElevation } from "@/components/ui/elevation";
import { Money, moneyLabel } from "@/components/ui/money";
import { duration, tick } from "@/components/ui/motion";
import { ErrorState } from "@/components/ui/states";
import { useThemeColors, withAlpha } from "@/components/ui/theme";
import { dateFormat } from "@/lib/intl-format";

import type { InsightsTimeScope } from "../analytics-scope";
import type { MonthlySpendComparison, MonthlyValue, SpendingPoint } from "../insights-data";

// The one hero on Analytics: the answer (a big number for the month so far),
// whether that's good (a delta against the same days last month), and the
// shape behind it — one bar per day with the daily average as a reference
// line, so spikes and quiet days show. The range toggle lives here because
// it only changes this chart. Tapping a bar rewrites the headline.

const CHART_HEIGHT = 148;

// A series point's `day` is that bucket's local-midnight timestamp
// (insights-data's SpendingPoint), not a day-of-month number.
function dayLabel(day: number): string {
  return dateFormat("en-IN", { day: "numeric", month: "short" }).format(day);
}

function monthName(monthStart: number): string {
  return dateFormat("en-IN", { month: "long" }).format(monthStart);
}

const SCOPE_OPTIONS: { value: InsightsTimeScope; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "sixMonths", label: "6 months" },
];

/** One bar per day; today (or the tapped day) in ink, the rest quiet. */
function DailyBars({
  series,
  selectedIndex,
  onSelect,
  color,
  currency,
}: {
  series: readonly SpendingPoint[];
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  color: string;
  currency: string;
}) {
  const colors = useThemeColors();
  const values = series.map((point) => Math.max(0, point.value));
  const max = Math.max(1, ...values);
  const average = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const highlighted = selectedIndex ?? values.length - 1;
  const gap = values.length > 20 ? 2 : 4;
  const first = series[0];
  const middle = series[Math.floor((series.length - 1) / 2)];
  return (
    <View>
      <View style={{ height: CHART_HEIGHT }}>
        <View className="h-full flex-row items-end" style={{ gap }}>
          {values.map((value, index) => (
            <Pressable
              key={series[index]!.day}
              accessibilityRole="button"
              accessibilityState={{ selected: index === selectedIndex }}
              accessibilityLabel={`${dayLabel(series[index]!.day)}, ${moneyLabel(value, currency)}`}
              onPress={() => {
                tick();
                onSelect(index === selectedIndex ? null : index);
              }}
              className="h-full flex-1 justify-end"
            >
              <View
                style={{
                  // A quiet stub marks a no-spend day instead of a gap.
                  height: value > 0 ? Math.max(4, (value / max) * CHART_HEIGHT) : 3,
                  borderRadius: 3,
                  backgroundColor:
                    index === highlighted ? color : value > 0 ? colors.fillStrong : colors.fill,
                }}
              />
            </Pressable>
          ))}
        </View>
        {/* The daily average: the scale the bars are read against. */}
        {average > 0 && values.length > 1 ? (
          <View
            pointerEvents="none"
            className="absolute left-0 right-0"
            style={{ bottom: (average / max) * CHART_HEIGHT }}
          >
            <View style={{ height: 1, backgroundColor: withAlpha(colors.ink, 0.28) }} />
            <View className="absolute -top-5 right-0 rounded-pill bg-card px-1.5">
              <Text className="text-label font-semibold text-muted">
                avg {moneyLabel(average, currency)}/day
              </Text>
            </View>
          </View>
        ) : null}
      </View>
      {first && middle && series.length > 1 ? (
        <View className="mt-2 flex-row justify-between">
          <Text className="text-label font-medium text-faint">{dayLabel(first.day)}</Text>
          <Text className="text-label font-medium text-faint">{dayLabel(middle.day)}</Text>
          <Text className="text-label font-medium text-faint">Today</Text>
        </View>
      ) : null}
    </View>
  );
}

export function AnalyticsHeroCard({
  mode,
  scope,
  onScopeChange,
  currency,
  comparison,
  dailySeries,
  monthlySeries,
  periodLabel,
  comparisonLabel,
  paymentCount,
  subscriptions,
  error,
  onRetry,
}: {
  mode: "spending" | "income";
  scope: InsightsTimeScope;
  onScopeChange: (scope: InsightsTimeScope) => void;
  currency: string;
  comparison: MonthlySpendComparison;
  dailySeries: SpendingPoint[];
  monthlySeries: MonthlyValue[];
  /** The month so far, e.g. "1–3 Oct". */
  periodLabel: string;
  /** The like-for-like window last month, e.g. "1–3 Sep". */
  comparisonLabel: string;
  /** Payments behind the month's total; null while unknown. */
  paymentCount: number | null;
  /** Spending only: the recurring charges, opening their sheet. */
  subscriptions?: { activeCount: number; monthlyLabel: string; onOpen: () => void } | null;
  error: string | null;
  onRetry: () => void;
}) {
  const colors = useThemeColors();
  const elevation = useCardElevation("raised");
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const verb = mode === "income" ? "Earned" : "Spent";
  const seriesColor = mode === "income" ? colors.positive : colors.chartLine;

  const bars = useMemo(
    () =>
      monthlySeries.map((point) => ({
        key: String(point.monthStart),
        label: new Date(point.monthStart).toLocaleDateString("en-IN", { month: "short" }),
        value: point.value,
        isCurrent: point.isCurrent,
        monthStart: point.monthStart,
      })),
    [monthlySeries],
  );
  const sixMonthTotal = bars.reduce((sum, bar) => sum + bar.value, 0);
  const activeMonths = bars.filter((bar) => bar.value > 0).length;
  const currentBar = bars.find((bar) => bar.isCurrent) ?? bars[bars.length - 1] ?? null;
  // The current month is selected by default, and the headline says so.
  const pickedBar = bars.find((bar) => bar.key === selectedMonth) ?? currentBar;

  let label: string;
  let value: number;
  let footnote: string | null = null;

  const pickedDay = selectedDay !== null ? dailySeries[selectedDay] : undefined;
  if (scope === "month") {
    if (pickedDay) {
      label = `${verb} on ${dayLabel(pickedDay.day)}`;
      value = pickedDay.value;
      const upTo = dailySeries
        .slice(0, (selectedDay ?? 0) + 1)
        .reduce((sum, point) => sum + point.value, 0);
      footnote = `${moneyLabel(upTo, currency)} by then`;
    } else {
      label = `${verb} so far · ${periodLabel}`;
      value = comparison.currentTotal;
    }
  } else if (pickedBar) {
    label = `${verb} in ${monthName(pickedBar.monthStart)}${pickedBar.isCurrent ? " so far" : ""}`;
    value = pickedBar.value;
    footnote =
      activeMonths > 0 ? `6-month avg ${moneyLabel(sixMonthTotal / activeMonths, currency)}` : null;
  } else {
    label = `${verb} · last 6 months`;
    value = sixMonthTotal;
  }

  const hasDaily = dailySeries.some((point) => point.value > 0);
  const hasMonthly = bars.some((bar) => bar.value > 0);
  const showFooter = (paymentCount !== null && paymentCount > 0) || Boolean(subscriptions);

  return (
    <View
      className="rounded-card bg-card px-5 pb-4 pt-5"
      style={[{ borderCurve: "continuous" }, elevation]}
    >
      <Text numberOfLines={1} className="text-caption font-medium text-muted">
        {label}
      </Text>
      <Money value={value} currency={currency} size="hero" animated className="mt-1" />
      <View className="mt-2 min-h-6 flex-row items-center gap-2">
        {scope === "month" && !pickedDay ? (
          <DeltaChip
            percent={comparison.percentChange}
            suffix={`vs ${comparisonLabel}`}
            goodWhen={mode === "income" ? "up" : "down"}
          />
        ) : null}
        {footnote ? (
          <Animated.View
            entering={FadeIn.duration(duration.fast)}
            exiting={FadeOut.duration(duration.fast)}
          >
            <Text className="text-caption text-muted">{footnote}</Text>
          </Animated.View>
        ) : null}
      </View>

      <Segmented
        value={scope}
        options={SCOPE_OPTIONS}
        onChange={(next) => {
          setSelectedDay(null);
          setSelectedMonth(null);
          onScopeChange(next);
        }}
        size="sm"
        className="mt-4"
      />

      <View className="mt-5">
        {error ? (
          <ErrorState compact title="Chart unavailable" body={error} onRetry={onRetry} />
        ) : scope === "month" ? (
          hasDaily ? (
            <DailyBars
              series={dailySeries}
              selectedIndex={selectedDay}
              onSelect={setSelectedDay}
              color={seriesColor}
              currency={currency}
            />
          ) : (
            <EmptyChart mode={mode} />
          )
        ) : hasMonthly ? (
          <BarChart
            data={bars}
            selectedKey={pickedBar?.key ?? null}
            color={seriesColor}
            onSelect={(key) => setSelectedMonth((current) => (current === key ? null : key))}
          />
        ) : (
          <EmptyChart mode={mode} />
        )}
      </View>

      {showFooter ? (
        <View
          className="mt-4 flex-row items-center gap-3 pt-3"
          style={{ borderTopWidth: 1, borderTopColor: colors.divider }}
        >
          <Text className="min-w-0 flex-1 text-meta text-muted">
            {paymentCount !== null && paymentCount > 0
              ? `${paymentCount} ${paymentCount === 1 ? "payment" : "payments"} this month`
              : ""}
          </Text>
          {subscriptions && subscriptions.activeCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Subscriptions, ${subscriptions.activeCount} active, ${subscriptions.monthlyLabel} a month`}
              onPress={subscriptions.onOpen}
              hitSlop={10}
              className="flex-row items-center gap-0.5"
            >
              <Text className="text-meta font-semibold text-accent-deep">
                {subscriptions.activeCount} subscriptions · {subscriptions.monthlyLabel}/mo
              </Text>
              <AppIcon name="chevron-right" size={13} color={colors.accentDeep} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function EmptyChart({ mode }: { mode: "spending" | "income" }) {
  return (
    <View className="h-40 items-center justify-center rounded-tile bg-fill">
      <Text className="text-caption text-muted">
        {mode === "income" ? "No income recorded in this period" : "No spending in this period yet"}
      </Text>
    </View>
  );
}
