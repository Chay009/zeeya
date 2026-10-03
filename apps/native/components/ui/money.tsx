import { useState } from "react";
import { View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { AppText as Text } from "@/components/app-text";
import { moneyFontFamily, moneyTextStyle } from "@/lib/fonts";
import { numberFormat } from "@/lib/intl-format";

import { easeOutCss, VALUE_DURATION, VALUE_FADE, VALUE_IN } from "./motion";

// The one way an amount is drawn. Spending renders in ink — only income is
// coloured — and the whole number carries the weight while the symbol and
// paise sit smaller and quieter, the way a designed finance app sets money.

type MoneySize = "display" | "hero" | "title" | "subtitle" | "body" | "caption";
type MoneyTone = "default" | "income" | "muted" | "negative" | "onHero";
type MoneySign = "none" | "income" | "expense" | "auto";

// Medium-to-semibold, never heavy: size carries the hierarchy, so a screen's
// one big number leads without every amount shouting.
const SIZE: Record<
  MoneySize,
  { main: number; minor: number; line: number; weight: "medium" | "semibold" }
> = {
  display: { main: 44, minor: 24, line: 50, weight: "semibold" },
  hero: { main: 36, minor: 20, line: 42, weight: "semibold" },
  title: { main: 24, minor: 15, line: 30, weight: "semibold" },
  subtitle: { main: 17, minor: 13, line: 22, weight: "medium" },
  body: { main: 15, minor: 12, line: 20, weight: "medium" },
  caption: { main: 13, minor: 11, line: 18, weight: "medium" },
};

const TONE: Record<MoneyTone, { main: string; minor: string }> = {
  default: { main: "text-ink", minor: "text-muted" },
  income: { main: "text-positive", minor: "text-positive" },
  muted: { main: "text-muted", minor: "text-muted" },
  negative: { main: "text-negative", minor: "text-negative" },
  onHero: { main: "text-on-hero", minor: "text-on-hero-muted" },
};

export function currencySymbol(currency: string): string {
  if (currency === "INR") return "₹";
  if (currency === "USD") return "$";
  if (currency === "EUR") return "€";
  if (currency === "GBP") return "£";
  return `${currency} `;
}

// Built once — this runs for every amount on screen.
const MONEY_WHOLE = numberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const MONEY_WITH_FRACTION = numberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const MONEY_NO_FRACTION = numberFormat("en-IN", { maximumFractionDigits: 0 });

export function splitMoney(value: number, currency: string) {
  const abs = Math.abs(value);
  const hasFraction = Math.round(abs * 100) % 100 !== 0;
  const [whole, fraction] = (hasFraction ? MONEY_WITH_FRACTION : MONEY_WHOLE)
    .format(abs)
    .split(".");
  return { symbol: currencySymbol(currency), whole: whole ?? "0", fraction: fraction ?? null };
}

/** Plain-string version for accessibility labels and tight captions. */
export function moneyLabel(value: number, currency: string): string {
  const { symbol, whole, fraction } = splitMoney(value, currency);
  return `${value < 0 ? "−" : ""}${symbol}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function Money({
  value,
  currency,
  size = "body",
  tone = "default",
  sign = "none",
  showFraction = true,
  animated = false,
  className = "",
}: {
  value: number;
  currency: string;
  size?: MoneySize;
  tone?: MoneyTone;
  /** income → "+", expense → "−", auto → from the value's sign. */
  sign?: MoneySign;
  showFraction?: boolean;
  /** Roll digits to new values (hero numbers that change in place). */
  animated?: boolean;
  className?: string;
}) {
  const spec = SIZE[size];
  const colors = TONE[tone];
  const { symbol, whole, fraction } = splitMoney(value, currency);
  const prefix =
    sign === "income"
      ? "+"
      : sign === "expense"
        ? "−"
        : sign === "auto" && value < 0
          ? "−"
          : sign === "auto" && value > 0
            ? "+"
            : "";
  const large = spec.main >= 26;
  const main = {
    fontFamily: moneyFontFamily(spec.weight),
    fontSize: spec.main,
    lineHeight: spec.line,
    letterSpacing: large ? -1 : -0.2,
    ...moneyTextStyle,
  };
  const minor = {
    fontFamily: moneyFontFamily("medium"),
    fontSize: spec.minor,
    lineHeight: spec.line,
    ...moneyTextStyle,
  };

  if (animated) {
    return (
      <View className={`flex-row items-baseline ${className}`}>
        <Text className={colors.main} style={large ? minor : main}>
          {prefix}
          {symbol.trim()}
          {symbol.endsWith(" ") ? " " : ""}
        </Text>
        <RollingNumber
          value={Math.abs(value)}
          showFraction={showFraction}
          style={main}
          toneClass={colors.main}
        />
      </View>
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={`${prefix}${symbol}${whole}${fraction ? `.${fraction}` : ""}`}
      className={`flex-row items-baseline ${className}`}
    >
      <Text numberOfLines={1} className={colors.main} style={large ? minor : main}>
        {prefix}
        {symbol.trim()}
        {symbol.endsWith(" ") ? " " : ""}
      </Text>
      <Text numberOfLines={1} className={colors.main} style={main}>
        {whole}
      </Text>
      {showFraction && fraction ? (
        <Text
          numberOfLines={1}
          className={large ? colors.minor : colors.main}
          style={large ? minor : main}
        >
          .{fraction}
        </Text>
      ) : null}
    </View>
  );
}

// A hero number that eases into a new value: ONE Text node, re-keyed on the
// formatted value so a change mounts a fresh node that rises and fades in
// (a static CSS keyframe — no shared values, no per-digit views). It
// replaced number-flow's per-digit rolling, which built ~135 native views
// per instance (14 stacked digits per slot), measured glyphs on mount, and
// restarted 900ms rolls on every chart scrub step. Unchanged values keep
// their node (same key), so a re-render never re-animates; the first mount
// doesn't animate either (the keyframe starts from the resting state's
// neighbour, so it reads as settling, not flashing). The keyframes are the
// shared VALUE_IN (motion.ts), so every changing amount moves the same way.

function RollingNumber({
  value,
  showFraction,
  style,
  toneClass,
}: {
  value: number;
  showFraction: boolean;
  style: Record<string, unknown>;
  toneClass: string;
}) {
  const reducedMotion = useReducedMotion();
  const text = (showFraction ? MONEY_WHOLE : MONEY_NO_FRACTION).format(value);
  // The first value renders at rest; only later values animate in.
  const [firstText] = useState(text);
  const animate = text !== firstText;
  return (
    <Animated.Text
      key={text}
      numberOfLines={1}
      className={toneClass}
      style={[
        style,
        animate
          ? {
              animationName: reducedMotion ? VALUE_FADE : VALUE_IN,
              animationDuration: VALUE_DURATION,
              animationTimingFunction: easeOutCss,
            }
          : null,
      ]}
    >
      {text}
    </Animated.Text>
  );
}
