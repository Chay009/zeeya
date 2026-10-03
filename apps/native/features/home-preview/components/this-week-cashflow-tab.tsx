import { View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { AppText as Text } from "@/components/app-text";
import { MoneyText } from "@/components/native-ui/money-text";
import { EmptyState } from "@/components/ui/states";
import { useThemeColors } from "@/components/ui/theme";

import type { HomePreviewData } from "../data";
import { hasFlowChartActivity } from "../data/flow-chart-scale";

// Week at a glance: totals first (the answer), then paired capsules per day
// — money in (green) beside money out (ink). No axes, no gridlines, no
// per-bar labels: the shape is the story, the totals are the numbers.

const PLOT_HEIGHT = 112;

// Grows up from the baseline once on mount (static keyframes); later value
// changes glide via the height transition. Declarative — no effect.
const GROW_IN = {
  from: { transform: [{ scaleY: 0 }] },
  to: { transform: [{ scaleY: 1 }] },
};

function Capsule({ ratio, color, delay }: { ratio: number; color: string; delay: number }) {
  const reducedMotion = useReducedMotion();
  return (
    <Animated.View
      style={{
        width: 9,
        height: Math.max(4, ratio * PLOT_HEIGHT),
        borderRadius: 5,
        borderCurve: "continuous",
        backgroundColor: color,
        opacity: ratio > 0 ? 1 : 0.35,
        transformOrigin: "bottom",
        animationName: reducedMotion ? "none" : GROW_IN,
        animationDuration: 480,
        animationDelay: delay,
        animationTimingFunction: "ease-out",
        animationFillMode: "backwards",
        transitionProperty: "height",
        transitionDuration: reducedMotion ? 0 : 380,
        transitionTimingFunction: "ease-out",
      }}
    />
  );
}

function Total({ label, value, color }: { label: string; value: string; color: string }) {
  const lines = value.split(" + ");
  return (
    <View className="min-w-0 flex-1">
      <View className="flex-row items-center gap-1.5">
        <View className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <Text className="text-caption font-medium text-muted">{label}</Text>
      </View>
      {lines.map((line, index) => (
        <MoneyText
          key={`${index}-${line}`}
          numberOfLines={1}
          weight="semibold"
          className="mt-1 text-ink"
          style={{ fontSize: 20, lineHeight: 26, letterSpacing: -0.4 }}
        >
          {index === 0 ? line : `+ ${line}`}
        </MoneyText>
      ))}
    </View>
  );
}

export function ThisWeekCashflowTab({ data }: { data: HomePreviewData["cashflow"] }) {
  const colors = useThemeColors();
  const { flowChart } = data;

  if (!hasFlowChartActivity(flowChart)) {
    return (
      <EmptyState
        compact
        icon="chart"
        art="hero-insights"
        title="No money moved this week"
        body="Income and spending appear here as they happen."
      />
    );
  }

  const max = Math.max(
    1,
    ...flowChart.days.flatMap((day) => [day.income.amount, day.expense.amount]),
  );

  return (
    <View>
      <View className="flex-row gap-4">
        <Total label="Money in" value={data.income} color={colors.positive} />
        <Total label="Money out" value={data.expense} color={colors.chartLine} />
      </View>

      <View
        className="mt-6 flex-row items-end justify-between border-b border-divider pb-2"
        style={{ height: PLOT_HEIGHT + 8 }}
      >
        {flowChart.days.map((day, index) => (
          <View key={day.label} className="flex-1 flex-row items-end justify-center gap-1">
            <Capsule ratio={day.income.amount / max} color={colors.positive} delay={index * 35} />
            <Capsule
              ratio={day.expense.amount / max}
              color={colors.chartLine}
              delay={index * 35 + 20}
            />
          </View>
        ))}
      </View>
      <View className="mt-2 flex-row">
        {flowChart.days.map((day) => (
          <View key={day.label} className="flex-1 items-center">
            <Text
              className={`text-label ${day.active ? "font-semibold text-ink" : "font-medium text-faint"}`}
            >
              {day.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
