import type { ReactNode } from "react";
import { View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import Svg, { Ellipse, Path, Rect } from "react-native-svg";

import { easeOutCss } from "@/components/ui/motion";
import { useThemeColors, withAlpha } from "@/components/ui/theme";

// Geometric state drawings. Catalog images (assets/art) stay on the big
// empties — a month with nothing, no budgets, no accounts. These are the
// smaller moments an icon was standing in for: no rows, no bars, nothing
// in a repeating group, a page that isn't there. Each plays once.
// Transform and opacity only.

const POP = {
  from: { opacity: 0, transform: [{ scale: 0.94 }] },
  to: { opacity: 1, transform: [{ scale: 1 }] },
};

const GROW = {
  from: { opacity: 0, transform: [{ scaleY: 0.35 }] },
  to: { opacity: 1, transform: [{ scaleY: 1 }] },
};

const DRAW = {
  from: { opacity: 0, transform: [{ scaleX: 0.2 }] },
  to: { opacity: 1, transform: [{ scaleX: 1 }] },
};

const TURN = {
  from: { opacity: 0, transform: [{ rotate: "-24deg" }, { scale: 0.94 }] },
  to: { opacity: 1, transform: [{ rotate: "0deg" }, { scale: 1 }] },
};

function Frame({
  size,
  children,
}: {
  size: number;
  children: ReactNode;
}) {
  return (
    <View
      style={{ width: size, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {children}
    </View>
  );
}

/** No payments in this list, filter, or day. */
export function EmptyReceipt({ size = 88 }: { size?: number }) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const lineWidth = size * 0.34;

  return (
    <Frame size={size}>
      <Animated.View
        style={{
          position: "absolute",
          inset: 0,
          animationName: reducedMotion ? "none" : POP,
          animationDuration: 280,
          animationTimingFunction: easeOutCss,
          animationFillMode: "backwards",
        }}
      >
        <Svg width={size} height={size} viewBox="0 0 120 120">
          <Ellipse cx={60} cy={108} rx={28} ry={4.5} fill={withAlpha(colors.ink, 0.1)} />
          <Rect x={34} y={26} width={52} height={68} rx={8} fill={withAlpha(colors.ink, 0.12)} />
          <Path
            d="M34 22 h52 a8 8 0 0 1 8 8 v62 l-8 6 -8 -6 -8 6 -8 -6 -8 6 -8 -6 -8 6 -4 -3 V30 a8 8 0 0 1 8 -8 z"
            fill={colors.card}
          />
          <Rect x={46} y={40} width={28} height={5} rx={2.5} fill={withAlpha(colors.ink, 0.16)} />
          <Rect x={46} y={52} width={20} height={5} rx={2.5} fill={withAlpha(colors.ink, 0.1)} />
        </Svg>
      </Animated.View>
      <Animated.View
        style={{
          position: "absolute",
          left: size * 0.38,
          top: size * 0.53,
          width: lineWidth,
          height: Math.max(4, size * 0.045),
          borderRadius: 3,
          backgroundColor: colors.accent,
          transformOrigin: "left",
          animationName: reducedMotion ? "none" : DRAW,
          animationDuration: 360,
          animationDelay: 160,
          animationTimingFunction: easeOutCss,
          animationFillMode: "backwards",
        }}
      />
    </Frame>
  );
}

const BARS = [
  { left: 0.18, height: 0.28, delay: 0, lime: false },
  { left: 0.4, height: 0.46, delay: 70, lime: true },
  { left: 0.62, height: 0.22, delay: 140, lime: false },
] as const;

/** No spending to chart yet. */
export function EmptyBars({ size = 88 }: { size?: number }) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const barWidth = size * 0.16;
  const baseline = size * 0.78;

  return (
    <Frame size={size}>
      <Svg width={size} height={size} viewBox="0 0 120 120" style={{ position: "absolute" }}>
        <Ellipse cx={60} cy={108} rx={32} ry={4.5} fill={withAlpha(colors.ink, 0.1)} />
        <Rect x={18} y={92} width={84} height={4} rx={2} fill={withAlpha(colors.ink, 0.12)} />
      </Svg>
      {BARS.map((bar) => (
        <Animated.View
          key={bar.left}
          style={{
            position: "absolute",
            left: size * bar.left,
            top: baseline - size * bar.height,
            width: barWidth,
            height: size * bar.height,
            borderRadius: 5,
            backgroundColor: bar.lime ? colors.accent : colors.fillStrong,
            transformOrigin: "bottom",
            animationName: reducedMotion ? "none" : GROW,
            animationDuration: 320,
            animationDelay: bar.delay,
            animationTimingFunction: easeOutCss,
            animationFillMode: "backwards",
          }}
        />
      ))}
    </Frame>
  );
}

/** Nothing in a repeating group. */
export function RepeatMark({ size = 88 }: { size?: number }) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();

  return (
    <Frame size={size}>
      <Svg width={size} height={size} viewBox="0 0 120 120" style={{ position: "absolute" }}>
        <Ellipse cx={60} cy={108} rx={26} ry={4.5} fill={withAlpha(colors.ink, 0.1)} />
        <Path
          d="M60 28 a28 28 0 1 0 24 14"
          stroke={withAlpha(colors.ink, 0.16)}
          strokeWidth={8}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
      <Animated.View
        style={{
          position: "absolute",
          inset: 0,
          animationName: reducedMotion ? "none" : TURN,
          animationDuration: 420,
          animationTimingFunction: easeOutCss,
          animationFillMode: "backwards",
        }}
      >
        <Svg width={size} height={size} viewBox="0 0 120 120">
          <Path
            d="M78 34 h16 v16"
            stroke={colors.accent}
            strokeWidth={8}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Path
            d="M60 28 a28 28 0 1 1 -20 48"
            stroke={colors.accent}
            strokeWidth={8}
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
      </Animated.View>
    </Frame>
  );
}

/** A route or a record that is not there. */
export function MissingMark({ size = 88 }: { size?: number }) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();

  return (
    <Frame size={size}>
      <Animated.View
        style={{
          position: "absolute",
          inset: 0,
          animationName: reducedMotion ? "none" : POP,
          animationDuration: 280,
          animationTimingFunction: easeOutCss,
          animationFillMode: "backwards",
        }}
      >
        <Svg width={size} height={size} viewBox="0 0 120 120">
          <Ellipse cx={60} cy={108} rx={28} ry={4.5} fill={withAlpha(colors.ink, 0.1)} />
          <Rect x={30} y={30} width={60} height={52} rx={12} fill={withAlpha(colors.ink, 0.12)} />
          <Rect x={30} y={26} width={60} height={52} rx={12} fill={colors.card} />
          <Path d="M72 26 h10 a8 8 0 0 1 8 8 v10 h-14 a4 4 0 0 1 -4 -4 z" fill={colors.accent} />
        </Svg>
      </Animated.View>
    </Frame>
  );
}
