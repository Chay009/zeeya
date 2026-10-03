import { Surface } from "heroui-native";
import { useCallback, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { Segmented, SelectPill } from "@/components/ui/controls";

import type { HomePreviewData } from "../data";
import { ThisWeekCalendarTab } from "./this-week-calendar-tab";
import { ThisWeekCashflowTab } from "./this-week-cashflow-tab";
import { ThisWeekCategoriesTab } from "./this-week-categories-tab";

const CHART_LABELS = ["Cashflow", "Categories", "Calendar"] as const;
const TAB_COUNT = CHART_LABELS.length;
// Opens on Cashflow — this card is "This week". The month's categories have
// their own art row above it on Home; the full list stays a tap away here.
const DEFAULT_TAB = 0;
const MORPH_DURATION_MS = 280;

// Tabs crossfade (with a small rise) and the panel morphs to the incoming
// tab's measured height — all declarative Reanimated CSS transitions, so a
// tab switch is one state change and zero effects. When the incoming tab is
// shorter, the height holds briefly so the outgoing content fades before it
// would be clipped.
const SHRINK_HOLD_MS = Math.round(MORPH_DURATION_MS * 0.45);

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
  // The previous tab rides along with the current one so the height
  // transition knows whether it is shrinking — set in the change handler.
  const [chart, setChart] = useState({ index: DEFAULT_TAB, previous: DEFAULT_TAB });
  const chartIndex = chart.index;
  // Panels mount the first time they're opened (then stay, so switching back
  // is instant). Mounting all three up front paid for a full
  // react-native-calendars month — ~35 day cells and a bottom sheet — plus
  // the categories list on Home's first paint and every re-render.
  const [visited, setVisited] = useState<ReadonlySet<number>>(() => new Set([DEFAULT_TAB]));
  const [tabHeights, setTabHeights] = useState<Partial<Record<number, number>>>({});
  const reducedMotion = useReducedMotion();
  const activeCurrency = selectedCurrency ?? data.selectedCurrency;

  // A just-opened panel has no measured height yet: hold the previous one
  // for that frame instead of collapsing the card.
  const panelHeight = tabHeights[chartIndex] ?? tabHeights[chart.previous];
  const outgoingHeight = tabHeights[chart.previous];
  const shrinking = panelHeight !== undefined && outgoingHeight !== undefined && panelHeight < outgoingHeight;
  const morphMs = reducedMotion ? 0 : MORPH_DURATION_MS;

  const selectChart = (index: number) => {
    setChart((current) => (current.index === index ? current : { index, previous: current.index }));
    setVisited((current) => (current.has(index) ? current : new Set(current).add(index)));
  };

  const renderPanel = (index: number) => {
    if (index === 0) return <ThisWeekCashflowTab data={data} />;
    if (index === 1) return <ThisWeekCategoriesTab data={data} />;
    return (
      <ThisWeekCalendarTab
        months={data.calendarMonths}
        currency={activeCurrency}
        isActive={chartIndex === 2}
      />
    );
  };

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

  return (
    <Surface asChild className="overflow-hidden rounded-card bg-card p-5">
      <View>
        <View className="flex-row items-center justify-between gap-3">
          <Segmented
            value={CHART_LABELS[chartIndex]!}
            options={CHART_LABELS.map((label) => ({ value: label, label }))}
            onChange={(label) => selectChart(CHART_LABELS.indexOf(label))}
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

        <Animated.View
          className="relative mt-5"
          style={{
            height: panelHeight,
            overflow: "hidden",
            transitionProperty: "height",
            transitionDuration: morphMs,
            transitionDelay: shrinking ? Math.min(morphMs, SHRINK_HOLD_MS) : 0,
            transitionTimingFunction: "ease-out",
          }}
        >
          {isScopeRefreshing ? (
            <View
              pointerEvents="none"
              className="absolute inset-0 z-[3] rounded-card bg-card/55"
            />
          ) : null}
          {Array.from({ length: TAB_COUNT }, (_, index) => {
            if (!visited.has(index)) return null;
            const active = chartIndex === index;
            return (
              <Animated.View
                key={CHART_LABELS[index]}
                className="absolute inset-x-0 top-0"
                style={{
                  zIndex: active ? 2 : 1,
                  opacity: active ? 1 : 0,
                  transform: [{ translateY: active ? 0 : 8 }],
                  transitionProperty: ["opacity", "transform"],
                  transitionDuration: morphMs,
                  transitionTimingFunction: "ease-out",
                }}
                onLayout={onTabLayout(index)}
                pointerEvents={active ? "auto" : "none"}
              >
                {renderPanel(index)}
              </Animated.View>
            );
          })}
        </Animated.View>
      </View>
    </Surface>
  );
}
