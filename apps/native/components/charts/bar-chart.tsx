import { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { AppText as Text } from "@/components/app-text";
import { duration, settle, tick } from "@/components/ui/motion";
import { useThemeColors } from "@/components/ui/theme";

// Column chart for period comparisons (last 6 months). Bars are soft
// capsules; the selected bar is solid ink, the rest recede to a quiet fill,
// so the eye goes straight to the month being discussed. Tapping a bar
// selects it and the caller updates the headline.

export interface BarDatum {
  key: string;
  label: string;
  value: number;
}

function Bar({
  ratio,
  selected,
  index,
  color,
  mutedColor,
  height,
}: {
  ratio: number;
  selected: boolean;
  index: number;
  color: string;
  mutedColor: string;
  height: number;
}) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(reducedMotion ? ratio : 0);
  const active = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    progress.value = reducedMotion ? ratio : withDelay(index * 40, withSpring(ratio, settle));
  }, [index, progress, ratio, reducedMotion]);

  useEffect(() => {
    active.value = reducedMotion ? (selected ? 1 : 0) : withTiming(selected ? 1 : 0, { duration: duration.base });
  }, [active, reducedMotion, selected]);

  // Selection crossfades the fill and lifts the bar a hair — the chosen
  // month reads as "picked up", not just recoloured.
  const style = useAnimatedStyle(() => ({
    height: Math.max(6, progress.value * height),
    backgroundColor: interpolateColor(active.value, [0, 1], [mutedColor, color]),
    transform: [{ scaleX: 1 + active.value * 0.06 }],
  }));

  return (
    <Animated.View
      style={[style, { width: "100%", maxWidth: 34, borderRadius: 10, borderCurve: "continuous" }]}
    />
  );
}

export function BarChart({
  data,
  selectedKey,
  onSelect,
  height = 150,
  color,
}: {
  data: readonly BarDatum[];
  selectedKey: string | null;
  onSelect?: (key: string) => void;
  height?: number;
  color?: string;
}) {
  const colors = useThemeColors();
  const max = Math.max(1, ...data.map((item) => item.value));
  const fill = color ?? colors.chartLine;

  return (
    <View>
      <View className="flex-row items-end gap-2.5" style={{ height }}>
        {data.map((item, index) => {
          const selected = item.key === selectedKey;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={item.label}
              onPress={() => {
                tick();
                onSelect?.(item.key);
              }}
              className="h-full flex-1 items-center justify-end"
            >
              <Bar
                ratio={item.value / max}
                selected={selected}
                index={index}
                color={fill}
                mutedColor={colors.fillStrong}
                height={height}
              />
            </Pressable>
          );
        })}
      </View>
      <View className="mt-2.5 flex-row gap-2.5">
        {data.map((item) => (
          <Text
            key={item.key}
            numberOfLines={1}
            className={`flex-1 text-center text-label ${
              item.key === selectedKey ? "font-semibold text-ink" : "font-medium text-faint"
            }`}
          >
            {item.label}
          </Text>
        ))}
      </View>
    </View>
  );
}
