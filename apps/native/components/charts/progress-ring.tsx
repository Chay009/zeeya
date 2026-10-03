import type { ReactNode } from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { AppText as Text } from "@/components/app-text";
import { useThemeColors } from "@/components/ui/theme";

// A small circular progress: a grey track and a coloured arc from 12 o'clock,
// with the percentage (or any content — an icon, a logo) in the middle. Takes
// a fraction of the width a bar needs, so a row or KPI cell stays compact.

export function ProgressRing({
  fraction,
  color,
  size = 44,
  stroke = 4,
  children,
  showPercent = false,
}: {
  /** 0..1 */
  fraction: number;
  color: string;
  size?: number;
  stroke?: number;
  /** Centre content; with `showPercent` and no children, the rounded %. */
  children?: ReactNode;
  showPercent?: boolean;
}) {
  const colors = useThemeColors();
  const clamped = Math.max(0, Math.min(1, fraction));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const percent = Math.round(clamped * 100);
  return (
    <View
      style={{ width: size, height: size }}
      className="items-center justify-center"
      accessible
      accessibilityLabel={`${percent}%`}
    >
      <Svg
        width={size}
        height={size}
        style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.fill}
          strokeWidth={stroke}
          fill="none"
        />
        {clamped > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference * clamped} ${circumference}`}
          />
        ) : null}
      </Svg>
      {children ??
        (showPercent ? (
          <Text
            className="font-semibold text-ink"
            style={{ fontSize: Math.max(10, Math.round(size * 0.26)) }}
          >
            {percent}%
          </Text>
        ) : null)}
    </View>
  );
}
