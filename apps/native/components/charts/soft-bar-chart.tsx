import { Pressable, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { AppText as Text } from "@/components/app-text";
import { tick } from "@/components/ui/motion";
import { useThemeColors, withAlpha } from "@/components/ui/theme";

// The one bar grammar: each slot is a quiet full-height ghost track, the
// value a solid bar inside it — pale accent for context, solid accent for the
// selected one. No gradients, no axis; the headline above carries the exact
// number and changes when a bar is tapped. Two densities: a few wide bars
// (months) or a month of narrow ones (days), where days still to come show
// only their track and a dotted line marks the daily average.

export interface SoftBar {
  key: string;
  /** Under the bar; empty to leave that slot unlabelled. */
  label: string;
  value: number;
  /** A slot with no data yet (a future day): track only, not tappable. */
  disabled?: boolean;
  /** Spoken label; defaults to `label`. */
  accessibilityLabel?: string;
  /** Shown above the bar while it's selected ("₹8,420"). */
  valueLabel?: string;
}

function Bar({
  ratio,
  selected,
  height,
  radius,
  selectedColor,
}: {
  ratio: number;
  selected: boolean;
  height: number;
  radius: number;
  selectedColor: string;
}) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  return (
    <Animated.View
      style={{
        width: "100%",
        height: ratio > 0 ? Math.max(radius * 2, ratio * height) : 0,
        borderRadius: radius,
        borderCurve: "continuous",
        // Grey for context, one solid colour for the bar being read — a
        // contrast anyone sees, not two shades of the same green.
        backgroundColor: selected ? selectedColor : colors.fillStrong,
        transitionProperty: ["height", "backgroundColor"],
        transitionDuration: reducedMotion ? 0 : [320, 160],
        transitionTimingFunction: "ease-out",
      }}
    />
  );
}

export function SoftBarChart({
  data,
  selectedKey,
  onSelect,
  height = 128,
  dense = false,
  average,
  averageLabel,
  selectedColor,
}: {
  data: readonly SoftBar[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  height?: number;
  /** Narrow bars for a month of days. */
  dense?: boolean;
  /** Draws a dotted reference line at this value. */
  average?: number;
  averageLabel?: string;
  /** The selected bar's colour; ink by default. */
  selectedColor?: string;
}) {
  const colors = useThemeColors();
  const solid = selectedColor ?? colors.ink;
  const selectedIndex = data.findIndex((bar) => bar.key === selectedKey);
  const selectedBar = selectedIndex >= 0 ? data[selectedIndex] : undefined;
  const max = Math.max(1, ...data.map((bar) => bar.value), average ?? 0);
  const gap = dense ? 3 : 8;
  const radius = dense ? 3 : 10;
  return (
    <View>
      <View style={{ height }}>
        <View className="h-full flex-row items-end" style={{ gap }}>
          {data.map((bar) => {
            const selected = bar.key === selectedKey;
            return (
              <Pressable
                key={bar.key}
                disabled={bar.disabled}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: bar.disabled }}
                accessibilityLabel={bar.accessibilityLabel ?? bar.label}
                onPress={() => {
                  if (!selected) tick();
                  onSelect(bar.key);
                }}
                className="h-full flex-1 justify-end overflow-hidden"
                // The ghost track: the slot's full height, quiet.
                style={{
                  borderRadius: radius,
                  borderCurve: "continuous",
                  backgroundColor: colors.fill,
                }}
              >
                {bar.disabled ? null : (
                  <Bar
                    ratio={bar.value / max}
                    selected={selected}
                    height={height}
                    radius={radius}
                    selectedColor={solid}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
        {/* The selected bar's value, in a small dark bubble above it. */}
        {selectedBar?.valueLabel && !selectedBar.disabled ? (
          <View
            pointerEvents="none"
            className="absolute"
            style={{
              // Centred over its bar, but kept inside the chart at the edges.
              ...(() => {
                const centre = (selectedIndex + 0.5) / data.length;
                if (centre < 0.15) return { left: 0, alignItems: "flex-start" as const };
                if (centre > 0.85) return { right: 0, alignItems: "flex-end" as const };
                return {
                  left: `${centre * 100}%` as const,
                  width: 96,
                  transform: [{ translateX: -48 }],
                  alignItems: "center" as const,
                };
              })(),
              bottom: Math.min(height - 8, (selectedBar.value / max) * height + 6),
            }}
          >
            <View className="rounded-lg px-2 py-1" style={{ backgroundColor: colors.ink }}>
              <Text
                numberOfLines={1}
                className="text-meta font-semibold"
                style={{ color: colors.onInk }}
              >
                {selectedBar.valueLabel}
              </Text>
            </View>
          </View>
        ) : null}
        {average !== undefined && average > 0 ? (
          <View
            pointerEvents="none"
            className="absolute left-0 right-0"
            style={{ bottom: (average / max) * height - 0.5 }}
          >
            <View
              style={{
                height: 0,
                borderTopWidth: 1,
                borderStyle: "dashed",
                borderColor: withAlpha(colors.ink, 0.35),
              }}
            />
            {averageLabel ? (
              <View
                className="absolute right-0 rounded-pill px-1.5"
                style={{ top: -18, backgroundColor: colors.card }}
              >
                <Text className="text-label font-medium text-muted">{averageLabel}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      <View className="mt-2 flex-row" style={{ gap }}>
        {data.map((bar) => (
          <View key={bar.key} className="flex-1 items-center" style={{ overflow: "visible" }}>
            {bar.label ? (
              <Text
                numberOfLines={1}
                className={`text-center text-caption ${
                  bar.key === selectedKey ? "font-semibold text-ink" : "text-muted"
                }`}
                style={dense ? { width: 40 } : undefined}
              >
                {bar.label}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}
