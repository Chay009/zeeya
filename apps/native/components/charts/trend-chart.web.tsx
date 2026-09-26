import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

import { AppText as Text } from "@/components/app-text";
import { useThemeColors } from "@/components/ui/theme";

import type { TrendChartProps } from "./trend-chart.types";

// Web has no Skia build; draw the same shape with SVG (no scrubbing).
const WIDTH = 320;

export function TrendChart({ data, height = 180, color, labels }: TrendChartProps) {
  const colors = useThemeColors();
  const stroke = color ?? colors.chartLine;
  const { line, area } = useMemo(() => {
    const max = Math.max(1, ...data.map((point) => point.value)) * 1.12;
    const step = data.length > 1 ? WIDTH / (data.length - 1) : WIDTH;
    const coords = data.map((point, index) => [index * step, height - (point.value / max) * height] as const);
    const path = coords.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    return { line: path, area: `${path} L${WIDTH},${height} L0,${height} Z` };
  }, [data, height]);

  if (data.length < 2) return <View style={{ height }} />;

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={stroke} stopOpacity={0.16} />
            <Stop offset="1" stopColor={stroke} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={area} fill="url(#trendFill)" />
        <Path d={line} stroke={stroke} strokeWidth={2.25} fill="none" strokeLinejoin="round" />
      </Svg>
      {labels ? (
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
