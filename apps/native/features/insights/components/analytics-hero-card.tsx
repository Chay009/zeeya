import { useMemo, useState } from "react";
import { View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { AppText as Text } from "@/components/app-text";
import { BarChart } from "@/components/charts/bar-chart";
import { TrendChart } from "@/components/charts/trend-chart";
import { DeltaChip } from "@/components/ui/controls";
import { Money, moneyLabel } from "@/components/ui/money";
import { duration } from "@/components/ui/motion";
import { ErrorState } from "@/components/ui/states";
import { useThemeColors } from "@/components/ui/theme";

import type { InsightsTimeScope } from "../analytics-scope";
import type { MonthlySpendComparison, MonthlyValue, SpendingPoint } from "../insights-data";

// The dominant card on Analytics: the answer (a big number), whether that's
// good (a delta chip that knows spending-down is good news), and the shape
// behind it. Scrubbing the line or tapping a bar rewrites the headline so
// the chart is something you ask questions of, not a picture.

function dayLabel(at: Date, day: number): string {
  const date = new Date(at.getFullYear(), at.getMonth(), day);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function monthName(monthStart: number): string {
  return new Date(monthStart).toLocaleDateString("en-IN", { month: "long" });
}

export function AnalyticsHeroCard({
  mode,
  scope,
  currency,
  comparison,
  dailySeries,
  monthlySeries,
  at,
  error,
  onRetry,
}: {
  mode: "spending" | "income";
  scope: InsightsTimeScope;
  currency: string;
  comparison: MonthlySpendComparison;
  dailySeries: SpendingPoint[];
  monthlySeries: MonthlyValue[];
  at: Date;
  error: string | null;
  onRetry: () => void;
}) {
  const colors = useThemeColors();
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const verb = mode === "income" ? "Earned" : "Spent";
  const seriesColor = mode === "income" ? colors.positive : colors.chartLine;

  // Month view plots the running total: a smooth "how the month built up"
  // curve instead of a jagged per-day line.
  const cumulative = useMemo(() => {
    let running = 0;
    return dailySeries.map((point) => {
      running += point.value;
      return { day: point.day, value: running, dayValue: point.value };
    });
  }, [dailySeries]);

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
  const currentBarKey = bars.find((bar) => bar.isCurrent)?.key ?? bars[bars.length - 1]?.key ?? null;
  const pickedBar = bars.find((bar) => bar.key === selectedMonth) ?? null;

  let label: string;
  let value: number;
  let footnote: string | null = null;

  if (scope === "month") {
    const scrubbed = scrubIndex !== null ? cumulative[scrubIndex] : undefined;
    if (scrubbed) {
      label = `${verb} by ${dayLabel(at, scrubbed.day)}`;
      value = scrubbed.value;
      footnote = `${moneyLabel(scrubbed.dayValue, currency)} on the day`;
    } else {
      label = `${verb} this month`;
      value = comparison.currentTotal;
    }
  } else if (pickedBar) {
    label = `${verb} in ${monthName(pickedBar.monthStart)}`;
    value = pickedBar.value;
  } else {
    label = `${verb} · last 6 months`;
    value = sixMonthTotal;
    footnote =
      activeMonths > 0 ? `Avg ${moneyLabel(sixMonthTotal / activeMonths, currency)} a month` : null;
  }

  const hasDaily = cumulative.some((point) => point.value > 0);
  const hasMonthly = bars.some((bar) => bar.value > 0);
  const lastDay = cumulative[cumulative.length - 1]?.day ?? 1;
  const trendLabels =
    cumulative.length > 1
      ? [dayLabel(at, 1), dayLabel(at, Math.max(1, Math.round(lastDay / 2))), "Today"]
      : [];

  return (
    <View className="rounded-card bg-card px-5 pb-5 pt-5">
      <Text className="text-caption font-medium text-muted">{label}</Text>
      <Money value={value} currency={currency} size="hero" animated className="mt-1" />
      <View className="mt-2 min-h-6 flex-row items-center gap-2">
        {scope === "month" && scrubIndex === null ? (
          <DeltaChip
            percent={comparison.percentChange}
            suffix="vs this time last month"
            goodWhen={mode === "income" ? "up" : "down"}
          />
        ) : null}
        {footnote ? (
          <Animated.View entering={FadeIn.duration(duration.fast)} exiting={FadeOut.duration(duration.fast)}>
            <Text className="text-caption text-muted">{footnote}</Text>
          </Animated.View>
        ) : null}
      </View>

      <View className="mt-5">
        {error ? (
          <ErrorState compact title="Chart unavailable" body={error} onRetry={onRetry} />
        ) : scope === "month" ? (
          hasDaily ? (
            <TrendChart
              data={cumulative}
              color={seriesColor}
              labels={trendLabels}
              onScrub={setScrubIndex}
            />
          ) : (
            <EmptyChart mode={mode} />
          )
        ) : hasMonthly ? (
          <BarChart
            data={bars}
            selectedKey={selectedMonth ?? currentBarKey}
            color={seriesColor}
            onSelect={(key) => setSelectedMonth((current) => (current === key ? null : key))}
          />
        ) : (
          <EmptyChart mode={mode} />
        )}
      </View>
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
