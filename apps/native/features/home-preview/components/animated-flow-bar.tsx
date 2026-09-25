import { useEffect } from "react";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

export function AnimatedFlowBar({ height, tone }: { height: number; tone: "income" | "expense" }) {
  const reducedMotion = useReducedMotion();
  const targetHeight = height <= 0 ? 0 : Math.max(2, height);
  const animatedHeight = useSharedValue(targetHeight);

  useEffect(() => {
    if (reducedMotion) {
      animatedHeight.value = targetHeight;
      return;
    }
    animatedHeight.value = withSpring(targetHeight, { damping: 22, stiffness: 260 });
  }, [animatedHeight, reducedMotion, targetHeight]);

  const style = useAnimatedStyle(() => ({
    height: animatedHeight.value,
  }));

  return (
    <Animated.View
      className={`w-3 rounded-[2px] ${tone === "income" ? "bg-emerald" : "bg-coral-bar"}`}
      style={style}
    />
  );
}
