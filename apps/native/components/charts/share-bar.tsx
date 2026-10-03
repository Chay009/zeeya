import { View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { duration, easeOutCss } from "@/components/ui/motion";

// One horizontal bar split into rounded segments with hairline gaps — how
// the category mix reads at a glance. Replaces the donut: it's easier to
// compare lengths than angles, and it fits a phone's width.
//
// Declarative Reanimated CSS, no effects: the bar slides in from the left
// once on mount inside a clipping track (a translate, so the rounded
// segments never squash the way a scaleX sweep did), and each segment's
// share transitions when the mix changes. That share transition is the one
// layout animation left: segments are flex items, so their positions follow
// each other's widths, and a transform can't express that without measuring.
// It is one short row, kept quick.

const SLIDE_IN = {
  from: { transform: [{ translateX: "-100%" }] },
  to: { transform: [{ translateX: "0%" }] },
} as const;

export function ShareBar({
  segments,
  height = 10,
}: {
  segments: readonly { key: string; value: number; color: string }[];
  height?: number;
}) {
  const reducedMotion = useReducedMotion();
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  if (total <= 0) return <View className="rounded-pill bg-fill" style={{ height }} />;

  return (
    <View className="overflow-hidden" style={{ height }}>
      <Animated.View
        className="flex-row gap-[3px]"
        style={{
          height,
          animationName: reducedMotion ? "none" : SLIDE_IN,
          animationDuration: 300,
          animationDelay: 80,
          animationTimingFunction: easeOutCss,
          animationFillMode: "backwards",
        }}
      >
        {segments
          .filter((segment) => segment.value > 0)
          .map((segment) => (
            <Animated.View
              key={segment.key}
              style={{
                flexGrow: segment.value / total,
                flexBasis: 0,
                minWidth: height,
                height,
                borderRadius: height / 2,
                backgroundColor: segment.color,
                transitionProperty: "flexGrow",
                transitionDuration: reducedMotion ? 0 : duration.base,
                transitionTimingFunction: easeOutCss,
              }}
            />
          ))}
      </Animated.View>
    </View>
  );
}
