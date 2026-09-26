import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
} from "react-native-reanimated";

import { settle } from "@/components/ui/motion";

// One horizontal bar split into rounded segments with hairline gaps — how
// the category mix reads at a glance. Replaces the donut: it's easier to
// compare lengths than angles, and it fits a phone's width. Segments grow
// in left-to-right on mount and re-settle when the mix changes.

function Segment({ share, color, height, index }: { share: number; color: string; height: number; index: number }) {
  const reducedMotion = useReducedMotion();
  const grow = useSharedValue(reducedMotion ? share : 0);

  useEffect(() => {
    grow.value = reducedMotion ? share : withDelay(80 + index * 45, withSpring(share, settle));
  }, [grow, index, reducedMotion, share]);

  const style = useAnimatedStyle(() => ({ flexGrow: grow.value, flexBasis: 0 }));

  return (
    <Animated.View
      style={[style, { minWidth: height, height, borderRadius: height / 2, backgroundColor: color }]}
    />
  );
}

export function ShareBar({
  segments,
  height = 10,
}: {
  segments: readonly { key: string; value: number; color: string }[];
  height?: number;
}) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  if (total <= 0) return <View className="rounded-pill bg-fill" style={{ height }} />;

  return (
    <View className="flex-row gap-[3px]" style={{ height }}>
      {segments
        .filter((segment) => segment.value > 0)
        .map((segment, index) => (
          <Segment
            key={segment.key}
            share={segment.value / total}
            color={segment.color}
            height={height}
            index={index}
          />
        ))}
    </View>
  );
}
