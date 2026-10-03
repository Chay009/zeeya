import { useState } from "react";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { AppText as Text } from "@/components/app-text";
import { moneyFontFamily } from "@/lib/fonts";

import { easeOutCss, VALUE_DURATION, VALUE_FADE, VALUE_IN } from "./motion";

// A headline amount set like a price tag: the currency symbol small and
// raised, the whole rupees heavy, the paise smaller and quieter. Takes an
// already-formatted label ("₹ 1,24,580.40"); anything that isn't a single
// symbol + number (e.g. "₹ 500 + $ 20" across currencies) is shown as-is.
//
// A new value settles in the way Money's does (re-keyed on the label, the
// shared VALUE_IN) — switching account or editing a budget reads as the
// number changing, not as a glitch. The first value renders at rest.

const SINGLE_AMOUNT = /^([^\d\s-]+)\s?(-?[\d,]+)(\.\d+)?$/;

export function HeroAmount({
  label,
  size = 44,
  color,
  mutedColor,
}: {
  label: string;
  size?: number;
  color: string;
  mutedColor: string;
}) {
  const reducedMotion = useReducedMotion();
  const [firstLabel] = useState(label);
  const settle =
    label !== firstLabel
      ? {
          animationName: reducedMotion ? VALUE_FADE : VALUE_IN,
          animationDuration: VALUE_DURATION,
          animationTimingFunction: easeOutCss,
        }
      : null;
  const match = SINGLE_AMOUNT.exec(label.trim());
  const main = {
    fontFamily: moneyFontFamily("semibold"),
    fontSize: size,
    lineHeight: size * 1.12,
    letterSpacing: -size * 0.035,
    color,
  };
  if (!match) {
    return (
      <Animated.View key={label} style={settle}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={main}>
          {label}
        </Text>
      </Animated.View>
    );
  }
  const [, symbol, whole, fraction] = match;
  return (
    <Animated.View
      key={label}
      accessible
      accessibilityLabel={label}
      className="flex-row items-start"
      style={settle}
    >
      <Text
        style={{
          fontFamily: moneyFontFamily("semibold"),
          fontSize: size * 0.46,
          lineHeight: size * 0.62,
          marginTop: size * 0.14,
          marginRight: 3,
          color: mutedColor,
        }}
      >
        {symbol}
      </Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
        style={[main, { flexShrink: 1 }]}
      >
        {whole}
      </Text>
      {fraction ? (
        <Text
          style={{
            fontFamily: moneyFontFamily("semibold"),
            fontSize: size * 0.42,
            lineHeight: size * 0.62,
            marginTop: size * 0.14,
            marginLeft: 1,
            color: mutedColor,
          }}
        >
          {fraction}
        </Text>
      ) : null}
    </Animated.View>
  );
}
