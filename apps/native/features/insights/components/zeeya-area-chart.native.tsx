import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import {
  CartesianChart,
  Area,
  Line,
  type CurveType,
} from "victory-native";
import { LinearGradient, vec } from "@shopify/react-native-skia";

import { AppText as Text } from "@/components/app-text";
import { formatMoney } from "@/features/dashboard/utils/format";
import { compactAxisLabel } from "@/features/home-preview/data/flow-chart-scale";
import { useThemeColors } from "@/components/ui/theme";
import { moneyFontFamily } from "@/lib/fonts";

import type { SpendingPoint } from "../insights-data";

export interface ZeeyaAreaChartProps {
  data: SpendingPoint[];
  isLoading?: boolean;
  curveType?: CurveType;
  height?: number;
  lineColor?: string;
  areaStartColor?: string;
  areaEndColor?: string;
  /** @deprecated pass areaStartColor / areaEndColor instead */
  areaColor?: string;
  showAxes?: boolean;
  currency?: string;
  at?: Date;
}

const UPDATE_ANIMATION = { type: "timing", duration: 400 } as const;

function axisTicks(data: SpendingPoint[]): number[] {
  if (data.length === 0) return [1];
  const maxDay = data[data.length - 1]?.day ?? data.length;
  const step = Math.max(1, Math.round(maxDay / 5));
  const ticks: number[] = [];
  for (let day = 1; day <= maxDay; day += step) ticks.push(day);
  if (ticks[ticks.length - 1] !== maxDay) ticks.push(maxDay);
  return ticks;
}

function formatPeakDay(at: Date, day: number): string {
  const date = new Date(at);
  date.setDate(day);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** Derive gradient colors from the line color if explicit ones aren't given. */
function resolveGradient(
  lineColor: string,
  areaStartColor?: string,
  areaEndColor?: string,
  areaColor?: string,
): [string, string] {
  if (areaStartColor && areaEndColor) return [areaStartColor, areaEndColor];
  // If legacy areaColor provided, derive a transparent version
  if (areaColor) return [areaColor.replace(/[\d.]+\)$/, "0.32)"), areaColor.replace(/[\d.]+\)$/, "0)")];
  // Auto-derive from line color
  const hex = lineColor.startsWith("#") ? lineColor : "#c9ef69";
  // Parse hex to rgba
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [`rgba(${r},${g},${b},0.28)`, `rgba(${r},${g},${b},0.0)`];
}

export function ZeeyaAreaChart({
  data,
  isLoading = false,
  curveType = "natural",
  height = 220,
  lineColor: lineColorProp,
  areaStartColor,
  areaEndColor,
  areaColor,
  showAxes = false,
  currency = "INR",
  at = new Date(),
}: ZeeyaAreaChartProps) {
  const colors = useThemeColors();
  const lineColor = lineColorProp ?? colors.chartLine;
  const [hasPaintedOnce, setHasPaintedOnce] = useState(false);
  const readyToPaint = !isLoading && data.length > 0;
  useEffect(() => {
    if (readyToPaint) setHasPaintedOnce(true);
  }, [readyToPaint]);
  const animate = hasPaintedOnce ? UPDATE_ANIMATION : undefined;

  const [gradientStart, gradientEnd] = resolveGradient(lineColor, areaStartColor, areaEndColor, areaColor);

  const maxValue = useMemo(
    () => Math.max(...data.map((point) => point.value), 1),
    [data],
  );
  const yTicks = useMemo(() => {
    const step = maxValue / 3;
    return [0, step, step * 2, maxValue];
  }, [maxValue]);
  const xTicks = useMemo(() => axisTicks(data), [data]);
  const peak = useMemo(() => {
    if (data.length === 0) return null;
    return data.reduce((best, point) => (point.value > best.value ? point : best), data[0]!);
  }, [data]);
  const maxDay = data[data.length - 1]?.day ?? 30;
  const peakLeft =
    peak && maxDay > 0 ? Math.min(76, Math.max(20, (peak.day / maxDay) * 68 + 14)) : 50;
  const peakTop =
    peak && maxValue > 0 ? Math.min(38, Math.max(6, (1 - peak.value / maxValue) * 52 + 4)) : 16;

  if (data.length === 0) {
    return null;
  }

  return (
    <View style={{ height }}>
      {showAxes ? (
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 30,
            justifyContent: "space-between",
            paddingVertical: 4,
          }}
        >
          {yTicks
            .slice()
            .reverse()
            .map((tick, index) => (
              <Text key={`y-${index}-${tick}`} className="text-[9px] font-semibold text-muted">
                {compactAxisLabel(tick, currency)}
              </Text>
            ))}
        </View>
      ) : null}

      <View
        style={{
          flex: 1,
          marginLeft: showAxes ? 30 : 0,
          marginBottom: showAxes ? 16 : 0,
        }}
      >
        <CartesianChart
          data={data}
          xKey="day"
          yKeys={["value"]}
          domainPadding={{ top: showAxes ? 28 : 18, left: 4, right: 4 }}
          axisOptions={
            showAxes
              ? {
                  tickCount: { x: 0, y: 0 },
                  lineColor: "transparent",
                  labelColor: "transparent",
                }
              : undefined
          }
        >
          {({ points, chartBounds }) => (
            <>
              <Area
                key="area"
                points={points.value}
                y0={chartBounds.bottom}
                curveType={curveType}
                animate={animate}
              >
                <LinearGradient
                  start={vec(0, chartBounds.top)}
                  end={vec(0, chartBounds.bottom)}
                  colors={[gradientStart, gradientEnd]}
                />
              </Area>
              <Line
                key="line"
                points={points.value}
                color={lineColor}
                strokeWidth={2.5}
                curveType={curveType}
                animate={animate}
              />
            </>
          )}
        </CartesianChart>

        {showAxes && peak && peak.value > 0 ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: `${peakLeft}%`,
              top: `${peakTop}%`,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.divider,
              backgroundColor: colors.card,
              paddingHorizontal: 8,
              paddingVertical: 4,
              shadowColor: "#101014",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.07,
              shadowRadius: 6,
              elevation: 3,
            }}
          >
            <Text
              className="text-[11px] font-bold text-ink"
              style={{ fontFamily: moneyFontFamily("bold") }}
            >
              {formatMoney(peak.value, currency)}
            </Text>
            <Text className="text-[10px] font-semibold text-muted">
              {formatPeakDay(at, peak.day)}
            </Text>
          </View>
        ) : null}
      </View>

      {showAxes ? (
        <View
          style={{
            position: "absolute",
            left: 30,
            right: 0,
            bottom: 0,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          {xTicks.map((tick) => (
            <Text key={`x-${tick}`} className="text-[9px] font-semibold text-muted">
              {tick}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
