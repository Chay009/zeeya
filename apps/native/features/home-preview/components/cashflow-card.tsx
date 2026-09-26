import { Surface } from "heroui-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Segmented, SelectPill } from "@/components/ui/controls";

import type { HomePreviewData } from "../data";
import { ThisWeekCalendarTab } from "./this-week-calendar-tab";
import { ThisWeekCashflowTab } from "./this-week-cashflow-tab";
import { ThisWeekCategoriesTab } from "./this-week-categories-tab";

const CHART_LABELS = ["Cashflow", "Categories", "Calendar"] as const;
const TAB_COUNT = CHART_LABELS.length;
const MORPH_DURATION_MS = 280;

const HEIGHT_TIMING = {
  duration: MORPH_DURATION_MS,
  easing: Easing.out(Easing.cubic),
};

function useMorphTabStyle(opacity: SharedValue<number>) {
  return useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: interpolate(opacity.value, [0, 1], [8, 0]) }],
  }));
}

function useTabOpacities(activeIndex: number, reducedMotion: boolean | null) {
  const opacity0 = useSharedValue(1);
  const opacity1 = useSharedValue(0);
  const opacity2 = useSharedValue(0);
  const opacities = [opacity0, opacity1, opacity2];

  useEffect(() => {
    opacities.forEach((opacity, index) => {
      const target = index === activeIndex ? 1 : 0;
      opacity.value = reducedMotion ? target : withTiming(target, { duration: MORPH_DURATION_MS });
    });
  }, [activeIndex, opacity0, opacity1, opacity2, reducedMotion]);

  return opacities;
}

export function CashflowCard({
  data,
  onSelectCurrency,
  selectedCurrency,
  isScopeRefreshing = false,
}: {
  data: HomePreviewData["cashflow"];
  onSelectCurrency?: (currency: string) => void;
  selectedCurrency?: string;
  /** Subtle overlay while a per-account SQL scope is in flight — chart stays mounted. */
  isScopeRefreshing?: boolean;
}) {
  const [chartIndex, setChartIndex] = useState(0);
  const [tabHeights, setTabHeights] = useState<Partial<Record<number, number>>>({});
  const reducedMotion = useReducedMotion();
  const activeCurrency = selectedCurrency ?? data.selectedCurrency;
  const animatedHeight = useSharedValue(0);
  const hasInitialHeight = useRef(false);
  const tabOpacities = useTabOpacities(chartIndex, reducedMotion);
  const cashflowStyle = useMorphTabStyle(tabOpacities[0]!);
  const categoriesStyle = useMorphTabStyle(tabOpacities[1]!);
  const calendarStyle = useMorphTabStyle(tabOpacities[2]!);

  const applyHeight = useCallback(
    (height: number, animate: boolean) => {
      if (height <= 0) return;
      if (!animate || reducedMotion) {
        animatedHeight.value = height;
        return;
      }
      animatedHeight.value = withTiming(height, HEIGHT_TIMING);
    },
    [animatedHeight, reducedMotion],
  );

  const morphToHeight = useCallback(
    (height: number, fromIndex: number, toIndex: number) => {
      if (height <= 0) return;
      const fromHeight = tabHeights[fromIndex] ?? animatedHeight.value;
      const shrinking = fromHeight > 0 && height < fromHeight;

      if (!hasInitialHeight.current) {
        hasInitialHeight.current = true;
        animatedHeight.value = height;
        return;
      }

      if (!shrinking || reducedMotion) {
        applyHeight(height, true);
        return;
      }

      // Hold the outgoing tab's height until it fades out, then shrink to the
      // incoming tab so content is not clipped mid-crossfade.
      animatedHeight.value = withTiming(
        fromHeight,
        { duration: Math.round(MORPH_DURATION_MS * 0.45), easing: Easing.out(Easing.cubic) },
        (finished) => {
          if (!finished) return;
          animatedHeight.value = withTiming(height, HEIGHT_TIMING);
        },
      );
    },
    [animatedHeight, applyHeight, reducedMotion, tabHeights],
  );

  const previousChartIndex = useRef(chartIndex);
  useEffect(() => {
    const nextHeight = tabHeights[chartIndex];
    if (nextHeight) {
      morphToHeight(nextHeight, previousChartIndex.current, chartIndex);
    }
    previousChartIndex.current = chartIndex;
  }, [chartIndex, morphToHeight, tabHeights]);

  const onTabLayout = useCallback(
    (index: number) => (event: LayoutChangeEvent) => {
      const height = event.nativeEvent.layout.height;
      if (height <= 0) return;
      setTabHeights((previous) =>
        previous[index] === height ? previous : { ...previous, [index]: height },
      );
    },
    [],
  );

  const panelStyle = useAnimatedStyle(() => ({
    height: animatedHeight.value > 0 ? animatedHeight.value : undefined,
    overflow: "hidden" as const,
  }));

  return (
    <Surface asChild className="overflow-hidden rounded-card bg-card p-5">
      <View>
        <View className="flex-row items-center justify-between gap-3">
          <Segmented
            value={CHART_LABELS[chartIndex]!}
            options={CHART_LABELS.map((label) => ({ value: label, label }))}
            onChange={(label) => setChartIndex(CHART_LABELS.indexOf(label))}
            size="sm"
            className="min-w-0 flex-1"
          />
          {data.availableCurrencies.length > 1 ? (
            <SelectPill
              value={activeCurrency}
              options={data.availableCurrencies.map((code) => ({ value: code, label: code }))}
              onChange={(code) => onSelectCurrency?.(code)}
              accessibilityLabel="Currency"
              tone="fill"
            />
          ) : null}
        </View>

        <Animated.View className="relative mt-5" style={panelStyle}>
          {isScopeRefreshing ? (
            <View
              pointerEvents="none"
              className="absolute inset-0 z-[3] rounded-card bg-card/55"
            />
          ) : null}
          {Array.from({ length: TAB_COUNT }, (_, index) => {
            const styles = [cashflowStyle, categoriesStyle, calendarStyle];
            const panels = [
              <ThisWeekCashflowTab key="cashflow" data={data} />,
              <ThisWeekCategoriesTab key="categories" data={data} />,
              <ThisWeekCalendarTab
                key="calendar"
                months={data.calendarMonths}
                currency={activeCurrency}
                isActive={chartIndex === 2}
              />,
            ];

            return (
              <Animated.View
                key={CHART_LABELS[index]}
                className="absolute inset-x-0 top-0"
                style={[styles[index], { zIndex: chartIndex === index ? 2 : 1 }]}
                onLayout={onTabLayout(index)}
                pointerEvents={chartIndex === index ? "auto" : "none"}
              >
                {panels[index]}
              </Animated.View>
            );
          })}
        </Animated.View>
      </View>
    </Surface>
  );
}
