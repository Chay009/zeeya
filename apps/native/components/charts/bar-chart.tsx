import { Pressable, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { AppText as Text } from "@/components/app-text";
import { duration, tick } from "@/components/ui/motion";
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

// Grows up from the baseline once, on mount. Static keyframes, so a data
// change never restarts it — changes are the height transition's job.
const GROW_IN = {
  from: { transform: [{ scaleY: 0 }] },
  to: { transform: [{ scaleY: 1 }] },
};

// Declarative Reanimated CSS: the bar states its target height/colour and the
// transition animates between renders — no shared values, no effects.
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
  return (
    <Animated.View
      style={{
        width: "100%",
        maxWidth: 34,
        transformOrigin: "bottom",
        animationName: reducedMotion ? "none" : GROW_IN,
        animationDuration: 520,
        animationDelay: index * 40,
        animationTimingFunction: "ease-out",
        animationFillMode: "backwards",
      }}
    >
      {/* Selection recolours and lifts the bar a hair — the chosen month
          reads as "picked up", not just recoloured. */}
      <Animated.View
        style={{
          height: Math.max(6, ratio * height),
          backgroundColor: selected ? color : mutedColor,
          transform: [{ scaleX: selected ? 1.06 : 1 }],
          borderRadius: 10,
          borderCurve: "continuous",
          transitionProperty: ["height", "backgroundColor", "transform"],
          transitionDuration: reducedMotion ? 0 : [420, duration.base, duration.base],
          transitionTimingFunction: "ease-out",
        }}
      />
    </Animated.View>
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
