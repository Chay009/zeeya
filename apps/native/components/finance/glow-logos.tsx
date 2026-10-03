import { useId } from "react";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { BrandLogo } from "@/features/home-preview/components/brand-logo";

// A row of brand logos, each trailing a soft glow of its own brand colour
// down from the badge, set on a rising stair (left lowest) — subscriptions
// read as a set of living services instead of a list of names. Static SVG
// per glow (a capsule filled with a fading gradient); no measuring, no motion.

export interface GlowLogoItem {
  key: string;
  letter: string;
  /** Badge background. */
  tile: string;
  /** The brand's strong colour — the glow. */
  ink: string;
  img?: string;
}

function Glow({ color, width, height }: { color: string; width: number; height: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <Svg width={width} height={height} style={{ position: "absolute", left: 0, top: width / 2 }}>
      <Defs>
        <LinearGradient id={`${id}glow`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.42} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect width={width} height={height} rx={width / 2} fill={`url(#${id}glow)`} />
    </Svg>
  );
}

export function GlowLogos({
  items,
  size = 34,
  tail = 48,
  step = 8,
}: {
  items: readonly GlowLogoItem[];
  /** Badge diameter. */
  size?: number;
  /** How far the glow trails below the badge's centre. */
  tail?: number;
  /** Rise per logo, left to right. */
  step?: number;
}) {
  const rise = (items.length - 1) * step;
  return (
    <View className="flex-row" style={{ gap: size * 0.28, height: size / 2 + tail + rise }}>
      {items.map((item, index) => (
        <View
          key={item.key}
          style={{ width: size, height: size / 2 + tail, marginTop: rise - index * step }}
        >
          <Glow color={item.ink} width={size} height={tail} />
          <View
            className="items-center justify-center rounded-full bg-card"
            style={{ width: size, height: size }}
          >
            <BrandLogo
              letter={item.letter}
              tile={item.tile}
              ink={item.ink}
              img={item.img}
              size={size - 4}
              radius={(size - 4) / 2}
              iconRatio={0.6}
            />
          </View>
        </View>
      ))}
    </View>
  );
}
