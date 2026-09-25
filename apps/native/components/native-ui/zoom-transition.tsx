import { useReducedMotion, ZoomIn } from "react-native-reanimated";
import Animated from "react-native-reanimated";
import type { ReactNode } from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

/**
 * A small route-content entrance used for detail surfaces. Reanimated's
 * reduced-motion hook is evaluated before selecting the entering builder, so
 * accessibility settings produce an immediate, stable layout.
 */
export function ZoomTransition({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return <View style={style}>{children}</View>;

  return (
    <Animated.View entering={ZoomIn.duration(240)} style={style}>
      {children}
    </Animated.View>
  );
}
