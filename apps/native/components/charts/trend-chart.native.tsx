import {
  Circle,
  DashPathEffect,
  LinearGradient,
  Line as SkiaLine,
  vec,
} from "@shopify/react-native-skia";
import { useMemo, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Area, CartesianChart, Line, useChartPressState } from "victory-native";
import { scheduleOnRN } from "react-native-worklets";

import { AppText as Text } from "@/components/app-text";
import { easeOut, tick } from "@/components/ui/motion";
import { useThemeColors, withAlpha } from "@/components/ui/theme";

import type { TrendChartProps } from "./trend-chart.types";

// A calm, modern trend line: monotone curve (no overshoot below zero),
// soft vertical gradient, no gridlines or y-axis — just the shape, an end
// marker for "now", and a scrub gesture that reports the touched point back
// to the header so the big number becomes the answer.

const INIT = { x: 0, y: { value: 0 } };

function ScrubMarker({
  x,
  y,
  top,
  bottom,
  color,
  halo,
}: {
  x: SharedValue<number>;
  y: SharedValue<number>;
  top: number;
  bottom: number;
  color: string;
  halo: string;
}) {
  const p1 = useDerivedValue(() => vec(x.value, top));
  const p2 = useDerivedValue(() => vec(x.value, bottom));
  return (
    <>
      <SkiaLine p1={p1} p2={p2} color={color} strokeWidth={1} opacity={0.35}>
        <DashPathEffect intervals={[3, 4]} />
      </SkiaLine>
      <Circle cx={x} cy={y} r={9} color={halo} />
      <Circle cx={x} cy={y} r={4.5} color={color} />
    </>
  );
}

/**
 * "Now" marker: a solid dot with a static halo. It used to breathe, but any
 * never-ending animation keeps the Skia canvas redrawing every frame on the
 * UI thread for as long as the chart is mounted — including while the tab is
 * hidden (freezeOnBlur freezes React, not native frame callbacks) — taxing
 * every other screen's scrolling.
 */
function NowMarker({ cx, cy, color, halo }: { cx: number; cy: number; color: string; halo: string }) {
  return (
    <>
      <Circle cx={cx} cy={cy} r={10} color={halo} />
      <Circle cx={cx} cy={cy} r={4} color={color} />
    </>
  );
}

export function TrendChart({
  data,
  height = 180,
  color,
  labels,
  onScrub,
}: TrendChartProps) {
  const colors = useThemeColors();
  const stroke = color ?? colors.chartLine;
  const { state, isActive } = useChartPressState(INIT);
  const reducedMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const reveal = useSharedValue(reducedMotion ? 1 : 0);
  // The first data set is drawn by the reveal wipe; only later data changes
  // morph the line. Derived during render — no "painted" effect.
  const [initialData] = useState(data);
  const animateChanges = data !== initialData;

  // First paint draws the line in from the left, like a pen stroke. Started
  // by the layout event that first gives the chart a width.
  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (width === 0 && next > 0 && !reducedMotion) {
      reveal.value = withTiming(1, { duration: 900, easing: easeOut });
    }
    setWidth(next);
  };

  const revealStyle = useAnimatedStyle(() => ({
    width: width > 0 ? width * reveal.value : "100%",
  }));

  // Haptic ticks at most every 60ms (decided on the UI thread): a fast scrub
  // across a month used to fire a haptic — and a JS round trip — per day.
  const lastTickAt = useSharedValue(0);
  useAnimatedReaction(
    () => (state.isActive.value ? state.matchedIndex.value : -1),
    (index, previous) => {
      if (index === previous) return;
      if (onScrub) scheduleOnRN(onScrub, index >= 0 ? index : null);
      if (index < 0) return;
      const now = Date.now();
      if (now - lastTickAt.value >= 60) {
        lastTickAt.value = now;
        scheduleOnRN(tick);
      }
    },
  );

  const chartData = useMemo(() => data.map((point, index) => ({ x: index, value: point.value })), [data]);
  const max = useMemo(() => Math.max(1, ...data.map((point) => point.value)), [data]);

  if (data.length < 2) return <View style={{ height }} />;

  return (
    <View>
      <View style={{ height }} onLayout={onLayout}>
        <Animated.View style={[{ height, overflow: "hidden" }, revealStyle]}>
        <View style={{ height, width: width > 0 ? width : "100%" }}>
        <CartesianChart
          data={chartData}
          xKey="x"
          yKeys={["value"]}
          domain={{ y: [0, max * 1.12] }}
          domainPadding={{ left: 6, right: 10, top: 8 }}
          // victory-native always builds a y-axis, and its default draws a
          // hairline grid line at every tick (25% black) even with no yAxis
          // prop. The design is "just the shape": zero-width grid lines, and
          // no font means no tick labels either.
          yAxis={[{ lineWidth: 0 }]}
          chartPressState={state}
          chartPressConfig={{ pan: { activateAfterLongPress: 80 } }}
        >
          {({ points, chartBounds }) => {
            const last = points.value[points.value.length - 1];
            return (
              <>
                <SkiaLine
                  p1={vec(chartBounds.left, chartBounds.bottom)}
                  p2={vec(chartBounds.right, chartBounds.bottom)}
                  color={colors.divider}
                  strokeWidth={1}
                />
                <Area
                  points={points.value}
                  y0={chartBounds.bottom}
                  curveType="monotoneX"
                  animate={animateChanges ? { type: "timing", duration: 450 } : undefined}
                >
                  <LinearGradient
                    start={vec(0, chartBounds.top)}
                    end={vec(0, chartBounds.bottom)}
                    colors={[withAlpha(stroke, 0.16), withAlpha(stroke, 0)]}
                  />
                </Area>
                <Line
                  points={points.value}
                  color={stroke}
                  strokeWidth={2.25}
                  strokeCap="round"
                  strokeJoin="round"
                  curveType="monotoneX"
                  animate={animateChanges ? { type: "timing", duration: 450 } : undefined}
                />
                {!isActive && last && typeof last.y === "number" ? (
                  <NowMarker cx={last.x} cy={last.y} color={stroke} halo={withAlpha(stroke, 0.16)} />
                ) : null}
                {isActive ? (
                  <ScrubMarker
                    x={state.x.position}
                    y={state.y.value.position}
                    top={chartBounds.top}
                    bottom={chartBounds.bottom}
                    color={stroke}
                    halo={withAlpha(stroke, 0.18)}
                  />
                ) : null}
              </>
            );
          }}
        </CartesianChart>
        </View>
        </Animated.View>
      </View>
      {labels && labels.length > 0 ? (
        <View className="mt-2 flex-row justify-between px-1">
          {labels.map((label, index) => (
            <Text key={`${label}-${index}`} className="text-label font-medium text-faint">
              {label}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
