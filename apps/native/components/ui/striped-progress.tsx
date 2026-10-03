import { useId } from "react";
import { View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Pattern, Rect, Stop } from "react-native-svg";

import { AppText as Text } from "@/components/app-text";

import { duration, easeOutCss } from "./motion";
import { useThemeColors } from "./theme";

// A progress bar with character: the fill is cut from 45° stripes with a
// soft top sheen, and its label rides inside the fill's end like a tag.
// Sized with percentages — no layout measuring.
//
// Motion is transform-only (no layout per frame) and declarative Reanimated
// CSS, no effects. The fill is always full width inside the clipped track and
// is translated so its end sits at the value; the label rides on the same
// translation. On mount the whole layer slides in from the left once (a
// translate, so the stripes never squash); after that a new value is a
// transition of that offset.

const SLIDE_IN = {
  from: { transform: [{ translateX: "-100%" }] },
  to: { transform: [{ translateX: "0%" }] },
} as const;

export function StripedProgress({
  value,
  color,
  label,
  height = 18,
  className,
}: {
  /** 0..1 (clamped; above 1 draws full). */
  value: number;
  color: string;
  /** Rides inside the fill ("74% USED"); moves after it when the fill is short. */
  label?: string;
  height?: number;
  className?: string;
}) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const share = Math.max(0, Math.min(1, value));
  const percent = Number((share * 100).toFixed(2));
  const radius = height / 2;
  const labelInside = share >= 0.3;
  const settle = {
    transitionProperty: "transform",
    transitionDuration: reducedMotion ? 0 : duration.base,
    transitionTimingFunction: easeOutCss,
  } as const;

  return (
    <View
      className={`overflow-hidden ${className ?? ""}`}
      style={{ height, borderRadius: radius, backgroundColor: colors.fill }}
    >
      <Animated.View
        style={{
          position: "absolute",
          inset: 0,
          animationName: reducedMotion || share === 0 ? "none" : SLIDE_IN,
          animationDuration: 300,
          animationDelay: 60,
          animationTimingFunction: easeOutCss,
          animationFillMode: "backwards",
        }}
      >
        {share > 0 ? (
          <Animated.View
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: radius,
              overflow: "hidden",
              transform: [{ translateX: `${percent - 100}%` }],
              ...settle,
            }}
          >
            <Svg width="100%" height={height}>
              <Defs>
                <Pattern
                  id={`${id}stripes`}
                  width={9}
                  height={9}
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <Rect width={9} height={9} fill={color} />
                  <Rect width={4} height={9} fill={colors.onHero} fillOpacity={0.16} />
                </Pattern>
                <LinearGradient id={`${id}sheen`} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={colors.onHero} stopOpacity={0.28} />
                  <Stop offset="0.55" stopColor={colors.onHero} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Rect width="100%" height={height} fill={`url(#${id}stripes)`} />
              <Rect width="100%" height={height} fill={`url(#${id}sheen)`} />
            </Svg>
          </Animated.View>
        ) : null}
        {label ? (
          <Animated.View
            pointerEvents="none"
            className="absolute inset-0 justify-center"
            style={{
              // Inside: the layer's right edge rides the fill's end. Outside:
              // its left edge does, so the tag sits just after the fill.
              alignItems: labelInside ? "flex-end" : "flex-start",
              paddingRight: labelInside ? 3 : 0,
              paddingLeft: labelInside ? 0 : 6,
              transform: [{ translateX: `${labelInside ? percent - 100 : percent}%` }],
              ...settle,
            }}
          >
            <View
              className="rounded-pill px-2"
              style={{
                height: height - 5,
                justifyContent: "center",
                backgroundColor: labelInside ? colors.card : "transparent",
                shadowColor: colors.ink,
                shadowOpacity: labelInside ? 0.12 : 0,
                shadowRadius: 3,
                shadowOffset: { width: 0, height: 1 },
              }}
            >
              <Text
                style={{ color: colors.ink, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 }}
              >
                {label}
              </Text>
            </View>
          </Animated.View>
        ) : null}
      </Animated.View>
    </View>
  );
}
