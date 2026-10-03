import { useId } from "react";
import { View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path, Rect } from "react-native-svg";

import { easeOutCss } from "@/components/ui/motion";
import { useThemeColors, withAlpha } from "@/components/ui/theme";

// "All caught up" — drawn, not a catalog image (assets/art/CATALOG.md): a
// tick is pure geometry, so it is SVG in the art set's flat 2.5D language
// (lime disc with a shaded lower face, soft halo, two sparkles, a floor
// shadow). Static 120×120 drawing; the only motion is CSS on Views, transform
// and opacity only: the disc settles in and a clip sweeps across the tick so
// it reads as being drawn.

const VIEWBOX = "0 0 120 120";
const TICK = "M42 59 L54 71 L79 45";

// A four-point sparkle centred on (x, y).
function sparkle(x: number, y: number, r: number): string {
  const w = r * 0.28;
  return `M${x} ${y - r} Q${x + w} ${y - w} ${x + r} ${y} Q${x + w} ${y + w} ${x} ${y + r} Q${x - w} ${y + w} ${x - r} ${y} Q${x - w} ${y - w} ${x} ${y - r}Z`;
}

// Settles in from 0.9 — nothing appears from nothing.
const POP_IN = {
  from: { opacity: 0, transform: [{ scale: 0.9 }] },
  to: { opacity: 1, transform: [{ scale: 1 }] },
};

// The draw is a transform-only reveal: a clipping window slides in from the
// left while its content counter-slides by the same amount, so the tick stays
// still and is uncovered left to right. The window starts showing the first
// 30% of the piece — the tick's round cap starts at x 37.5 of 120 (31%), so
// nothing shows until the disc is in. In percent, so it holds at any size.
const REVEAL_WINDOW = {
  from: { transform: [{ translateX: "-70%" }] },
  to: { transform: [{ translateX: "0%" }] },
} as const;
const REVEAL_CONTENT = {
  from: { transform: [{ translateX: "70%" }] },
  to: { transform: [{ translateX: "0%" }] },
} as const;
const REVEAL = {
  animationDuration: 300,
  animationDelay: 120,
  animationTimingFunction: easeOutCss,
  animationFillMode: "backwards",
} as const;

export function CaughtUpTick({ size = 88 }: { size?: number }) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const clipId = `tick-disc-${useId().replace(/:/g, "")}`;

  return (
    <View
      style={{ width: size, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        style={{
          position: "absolute",
          inset: 0,
          animationName: reducedMotion ? "none" : POP_IN,
          animationDuration: 260,
          animationTimingFunction: easeOutCss,
          animationFillMode: "backwards",
        }}
      >
        <Svg width={size} height={size} viewBox={VIEWBOX}>
          <Defs>
            <ClipPath id={clipId}>
              <Circle cx={60} cy={58} r={38} />
            </ClipPath>
          </Defs>
          <Ellipse cx={60} cy={107} rx={28} ry={4.5} fill={withAlpha(colors.ink, 0.1)} />
          <Circle cx={60} cy={58} r={52} fill={withAlpha(colors.accent, 0.18)} />
          <G clipPath={`url(#${clipId})`}>
            <Rect x={0} y={0} width={120} height={120} fill={colors.accent} />
            <Rect x={0} y={0} width={120} height={120} fill={withAlpha(colors.ink, 0.12)} />
            <Circle cx={56} cy={54} r={38} fill={colors.accent} />
          </G>
          <Path
            d="M33 50 A29 29 0 0 1 48 31"
            stroke={withAlpha("#FFFFFF", 0.55)}
            strokeWidth={4}
            strokeLinecap="round"
            fill="none"
          />
          <Path d={sparkle(100, 22, 8)} fill={colors.accent} />
          <Path d={sparkle(19, 30, 5)} fill={colors.accent} />
        </Svg>
      </Animated.View>
      <Animated.View
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          animationName: reducedMotion ? "none" : REVEAL_WINDOW,
          ...REVEAL,
        }}
      >
        <Animated.View
          style={{
            position: "absolute",
            inset: 0,
            animationName: reducedMotion ? "none" : REVEAL_CONTENT,
            ...REVEAL,
          }}
        >
          <Svg width={size} height={size} viewBox={VIEWBOX}>
            <Path
              d={TICK}
              stroke={colors.onAccent}
              strokeWidth={9}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  );
}
