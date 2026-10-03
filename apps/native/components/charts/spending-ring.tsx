import type { ReactNode } from "react";
import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { AppText as Text } from "@/components/app-text";
import { AppIcon, type AppIconName } from "@/components/icon";
import { useThemeColors } from "@/components/ui/theme";

// The Spending view's ring: thick rounded arcs, one per share (largest first,
// small gaps between), a dotted tick circle inside, and the total in the
// middle. Few segments by design — a ring reads only when it has 2–4 parts.
// Plus the small three-quarter gauges that sit under it.

const TAU = Math.PI * 2;

function polar(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const a = polar(cx, cy, r, start);
  const b = polar(cx, cy, r, end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

export interface RingSegment {
  key: string;
  value: number;
  color: string;
}

export function SpendingRing({
  segments,
  size = 200,
  stroke = 18,
  children,
}: {
  segments: readonly RingSegment[];
  size?: number;
  stroke?: number;
  /** The centre: label + total. */
  children: ReactNode;
}) {
  const colors = useThemeColors();
  const cx = size / 2;
  const r = (size - stroke) / 2;
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  // Gap between arcs, in radians, wide enough for the round caps.
  const gap = segments.length > 1 ? (stroke * 1.4) / r : 0;
  let cursor = -Math.PI / 2;
  const arcs = segments
    .filter((segment) => segment.value > 0)
    .map((segment) => {
      const sweep = (segment.value / Math.max(total, 1)) * TAU;
      const start = cursor + gap / 2;
      const end = cursor + Math.max(sweep - gap / 2, gap / 2 + 0.001);
      cursor += sweep;
      return { ...segment, d: arcPath(cx, cx, r, start, end) };
    });

  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        {total <= 0 ? (
          <Circle cx={cx} cy={cx} r={r} stroke={colors.fill} strokeWidth={stroke} fill="none" />
        ) : (
          arcs.map((arc) => (
            <Path
              key={arc.key}
              d={arc.d}
              stroke={arc.color}
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
            />
          ))
        )}
      </Svg>
      <View className="items-center">{children}</View>
    </View>
  );
}

/** A small three-quarter gauge with an icon inside, label and value under. */
export function MiniGauge({
  fraction,
  icon,
  label,
  value,
  size = 64,
}: {
  /** 0..1 of the arc. */
  fraction: number;
  icon: AppIconName;
  label: string;
  value: string;
  size?: number;
}) {
  const colors = useThemeColors();
  const stroke = 7;
  const cx = size / 2;
  const r = (size - stroke) / 2;
  // 270° arc opening at the bottom: from 135° to 405°.
  const start = (3 * Math.PI) / 4;
  const span = (3 * Math.PI) / 2;
  const clamped = Math.max(0, Math.min(1, fraction));
  return (
    <View accessible accessibilityLabel={`${label}, ${value}`} className="items-center">
      <View style={{ width: size, height: size }} className="items-center justify-center">
        <Svg width={size} height={size} style={{ position: "absolute" }}>
          <Path
            d={arcPath(cx, cx, r, start, start + span)}
            stroke={colors.fill}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
          />
          {clamped > 0.005 ? (
            <Path
              d={arcPath(cx, cx, r, start, start + span * clamped)}
              stroke={colors.accent}
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
            />
          ) : null}
        </Svg>
        <AppIcon name={icon} size={18} color={colors.ink} />
      </View>
      <Text className="mt-1.5 text-caption text-muted">{label}</Text>
      <Text className="text-body font-semibold text-ink">{value}</Text>
    </View>
  );
}
