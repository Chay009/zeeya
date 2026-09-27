import { View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

// One horizontal bar split into rounded segments with hairline gaps — how
// the category mix reads at a glance. Replaces the donut: it's easier to
// compare lengths than angles, and it fits a phone's width.
//
// Declarative Reanimated CSS, no effects: the bar sweeps in from the left
// once on mount (static keyframes), and each segment's share transitions
// when the mix changes.

const SWEEP_IN = {
  from: { transform: [{ scaleX: 0 }] },
  to: { transform: [{ scaleX: 1 }] },
};

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
    <Animated.View
      className="flex-row gap-[3px]"
      style={{
        height,
        transformOrigin: "left",
        animationName: reducedMotion ? "none" : SWEEP_IN,
        animationDuration: 560,
        animationDelay: 80,
        animationTimingFunction: "ease-out",
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
              transitionDuration: reducedMotion ? 0 : 420,
              transitionTimingFunction: "ease-out",
            }}
          />
        ))}
    </Animated.View>
  );
}
