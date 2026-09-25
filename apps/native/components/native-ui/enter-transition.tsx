import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { FadeIn, FadeInDown, useReducedMotion } from "react-native-reanimated";

const STAGGER_MS = 50;
const DURATION_MS = 300;

/**
 * Staggered layout entrance for lists and Home sections. Skips motion when the
 * user has reduced motion enabled — same contract as ZoomTransition.
 */
export function EnterTransition({
  children,
  index = 0,
  style,
  variant = "up",
}: {
  children: ReactNode;
  index?: number;
  style?: StyleProp<ViewStyle>;
  variant?: "up" | "fade";
}) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return <View style={style}>{children}</View>;

  const delay = index * STAGGER_MS;
  const entering =
    variant === "fade"
      ? FadeIn.duration(DURATION_MS).delay(delay)
      : FadeInDown.duration(DURATION_MS).delay(delay).springify().damping(22).stiffness(260);

  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}
