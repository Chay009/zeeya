import { View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg";

import { easeOutCss } from "@/components/ui/motion";
import { useThemeColors, withAlpha } from "@/components/ui/theme";

// A bank message becoming a payment. Geometry, so it is SVG rather than a
// catalog image (assets/art/CATALOG.md): a paper card with one lime seal,
// and a coin that slides out of it. Plays once. Transform and opacity only.
// Home's wallet and the calendar stay generated images — this is the moment
// those pictures cannot show.

const VIEW_W = 160;
const VIEW_H = 120;

const CARD_IN = {
  from: { opacity: 0, transform: [{ scale: 0.94 }] },
  to: { opacity: 1, transform: [{ scale: 1 }] },
};

// Percent of the coin itself, so the slide holds at any size. It starts
// tucked into the card and settles just clear of the card's right edge.
const COIN_IN = {
  "0%": { opacity: 0, transform: [{ translateX: "-72%" }, { scale: 0.92 }] },
  "100%": { opacity: 1, transform: [{ translateX: "0%" }, { scale: 1 }] },
};

const SPARK_IN = {
  from: { opacity: 0, transform: [{ scale: 0.9 }] },
  to: { opacity: 1, transform: [{ scale: 1 }] },
};

function sparkle(x: number, y: number, r: number): string {
  const w = r * 0.28;
  return `M${x} ${y - r} Q${x + w} ${y - w} ${x + r} ${y} Q${x + w} ${y + w} ${x} ${y + r} Q${x - w} ${y + w} ${x - r} ${y} Q${x - w} ${y - w} ${x} ${y - r}Z`;
}

export function MessageArrived({
  size = 120,
  on = "background",
}: {
  size?: number;
  /** The surface behind the drawing, so the paper card stays visible on it. */
  on?: "background" | "card";
}) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const width = (size * VIEW_W) / VIEW_H;
  const paper = on === "card" ? colors.background : colors.card;
  const coin = colors.fill;

  const coinSize = (44 / VIEW_H) * size;
  const coinLeft = ((124 - 22) / VIEW_W) * width;
  const coinTop = ((58 - 22) / VIEW_H) * size;
  const sparkSize = (22 / VIEW_H) * size;
  const sparkLeft = ((138 - 8) / VIEW_W) * width;
  const sparkTop = ((18 - 8) / VIEW_H) * size;

  return (
    <View
      style={{ width, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        style={{
          position: "absolute",
          inset: 0,
          animationName: reducedMotion ? "none" : CARD_IN,
          animationDuration: 280,
          animationTimingFunction: easeOutCss,
          animationFillMode: "backwards",
        }}
      >
        <Svg width={width} height={size} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
          <Ellipse cx={78} cy={108} rx={46} ry={5} fill={withAlpha(colors.ink, 0.1)} />
          <Rect x={17} y={29} width={88} height={62} rx={15} fill={withAlpha(colors.ink, 0.08)} />
          <Rect x={18} y={34} width={86} height={60} rx={14} fill={withAlpha(colors.ink, 0.14)} />
          <Rect x={18} y={30} width={86} height={60} rx={14} fill={paper} />
          <Rect x={32} y={48} width={46} height={6} rx={3} fill={withAlpha(colors.ink, 0.16)} />
          <Rect x={32} y={60} width={32} height={6} rx={3} fill={withAlpha(colors.ink, 0.1)} />
          <Rect x={82} y={38} width={14} height={8} rx={3} fill={colors.accent} />
        </Svg>
      </Animated.View>

      <Animated.View
        style={{
          position: "absolute",
          left: coinLeft,
          top: coinTop,
          width: coinSize,
          height: coinSize,
          animationName: reducedMotion ? "none" : COIN_IN,
          animationDuration: 520,
          animationDelay: 160,
          animationTimingFunction: easeOutCss,
          animationFillMode: "backwards",
        }}
      >
        <Svg width={coinSize} height={coinSize} viewBox="0 0 44 44">
          <Circle cx={22} cy={24} r={16} fill={withAlpha(colors.ink, 0.2)} />
          <Circle cx={22} cy={20} r={16} fill={coin} />
          <Path
            d="M12 16 A10 10 0 0 1 22 10"
            stroke={colors.accent}
            strokeWidth={2.5}
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
      </Animated.View>

      <Animated.View
        style={{
          position: "absolute",
          left: sparkLeft,
          top: sparkTop,
          width: sparkSize,
          height: sparkSize,
          animationName: reducedMotion ? "none" : SPARK_IN,
          animationDuration: 220,
          animationDelay: 520,
          animationTimingFunction: easeOutCss,
          animationFillMode: "backwards",
        }}
      >
        <Svg width={sparkSize} height={sparkSize} viewBox="0 0 22 22">
          <Path d={sparkle(11, 11, 7)} fill={colors.accent} />
        </Svg>
      </Animated.View>
    </View>
  );
}
