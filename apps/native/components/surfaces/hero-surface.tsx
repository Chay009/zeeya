import { useId, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";

import { useThemeColors, withAlpha } from "@/components/ui/theme";

// The hero surface: a near-black card lit like a physical object — a lime
// light behind the illustration, a sheen from the top-left, and guilloché
// (banknote engraving) lines fading in from the left and warming to lime.
//
// Static art: drawn once on a fixed viewBox and scaled with "slice" like a
// background image, so there is no measuring and no second render. Colours
// come from theme tokens, so light and dark themes both work.

const VIEW_W = 360;
const VIEW_H = 200;

/** Interleaved sine waves with drifting phase — the moiré of an engraved note. */
function guillochePath(line: number, count: number): string {
  const baseline = VIEW_H * 0.58 + (line - count / 2) * 3.2;
  const amplitude = VIEW_H * 0.14 * (0.55 + (line / count) * 0.45);
  const phase = line * 0.32;
  let d = "";
  for (let x = 0; x <= VIEW_W + 8; x += 8) {
    const y =
      baseline +
      Math.sin((x / (VIEW_W * 0.62)) * Math.PI * 2 + phase) * amplitude +
      Math.sin((x / (VIEW_W * 0.23)) * Math.PI * 2 - phase * 1.7) * amplitude * 0.18;
    d += `${x === 0 ? "M" : "L"}${x} ${y.toFixed(1)}`;
  }
  return d;
}

const GUILLOCHE = Array.from({ length: 16 }, (_, line) => guillochePath(line, 16));

export function HeroSurface({
  children,
  radius = 28,
  glowAt = { x: 0.94, y: 1.08 },
  className,
  style,
}: {
  children: ReactNode;
  radius?: number;
  /** Where the lime light sits (fractions of the card) — behind the illustration. */
  glowAt?: { x: number; y: number };
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useThemeColors();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");

  return (
    <View
      className={className}
      style={[
        {
          borderRadius: radius,
          borderCurve: "continuous",
          overflow: "hidden",
          backgroundColor: colors.hero,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: withAlpha(colors.onHero, 0.14),
        },
        style,
      ]}
    >
      <Svg
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid slice"
      >
        <Defs>
          <RadialGradient
            id={`${id}glow`}
            cx={glowAt.x}
            cy={glowAt.y}
            r={0.62}
            fx={glowAt.x}
            fy={glowAt.y}
          >
            <Stop offset="0" stopColor={colors.accent} stopOpacity={0.42} />
            <Stop offset="0.4" stopColor={colors.accent} stopOpacity={0.1} />
            <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id={`${id}sheen`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.onHero} stopOpacity={0.09} />
            <Stop offset="0.42" stopColor={colors.onHero} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient
            id={`${id}lines`}
            x1="0"
            y1="0"
            x2={VIEW_W}
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor={colors.onHero} stopOpacity={0} />
            <Stop offset="0.45" stopColor={colors.onHero} stopOpacity={0.035} />
            <Stop offset="1" stopColor={colors.accent} stopOpacity={0.16} />
          </LinearGradient>
        </Defs>
        <Rect width={VIEW_W} height={VIEW_H} fill={`url(#${id}glow)`} />
        {GUILLOCHE.map((d, index) => (
          <Path key={index} d={d} fill="none" stroke={`url(#${id}lines)`} strokeWidth={0.9} />
        ))}
        <Rect width={VIEW_W} height={VIEW_H} fill={`url(#${id}sheen)`} />
      </Svg>
      {children}
    </View>
  );
}
