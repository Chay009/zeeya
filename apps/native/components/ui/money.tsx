import { NumberFlow } from "number-flow-react-native";
import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { moneyFontFamily, moneyTextStyle } from "@/lib/fonts";

import { useThemeColors, type ThemeColors } from "./theme";

// The one way an amount is drawn. Spending renders in ink — only income is
// coloured — and the whole number carries the weight while the symbol and
// paise sit smaller and quieter, the way a designed finance app sets money.

type MoneySize = "display" | "hero" | "title" | "subtitle" | "body" | "caption";
type MoneyTone = "default" | "income" | "muted" | "negative" | "onHero";
type MoneySign = "none" | "income" | "expense" | "auto";

const SIZE: Record<MoneySize, { main: number; minor: number; line: number; weight: "semibold" | "bold" }> = {
  display: { main: 48, minor: 26, line: 54, weight: "bold" },
  hero: { main: 40, minor: 22, line: 46, weight: "bold" },
  title: { main: 26, minor: 16, line: 32, weight: "bold" },
  subtitle: { main: 17, minor: 13, line: 22, weight: "semibold" },
  body: { main: 15, minor: 12, line: 20, weight: "semibold" },
  caption: { main: 13, minor: 11, line: 18, weight: "semibold" },
};

const TONE_COLOR: Record<MoneyTone, keyof ThemeColors> = {
  default: "ink",
  income: "positive",
  muted: "muted",
  negative: "negative",
  onHero: "onHero",
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

export function splitMoney(value: number, currency: string) {
  const abs = Math.abs(value);
  const hasFraction = Math.round(abs * 100) % 100 !== 0;
  const [whole, fraction] = abs
    .toLocaleString("en-IN", {
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: 2,
    })
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
  const main = { fontFamily: moneyFontFamily(spec.weight), fontSize: spec.main, lineHeight: spec.line, letterSpacing: large ? -1 : -0.2, ...moneyTextStyle };
  const minor = { fontFamily: moneyFontFamily("semibold"), fontSize: spec.minor, lineHeight: spec.line, ...moneyTextStyle };

  if (animated) {
    return (
      <View className={`flex-row items-baseline ${className}`}>
        <Text className={colors.main} style={large ? minor : main}>
          {prefix}
          {symbol.trim()}
          {symbol.endsWith(" ") ? " " : ""}
        </Text>
        <RollingNumber value={Math.abs(value)} showFraction={showFraction} style={main} tone={tone} />
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
        <Text numberOfLines={1} className={large ? colors.minor : colors.main} style={large ? minor : main}>
          .{fraction}
        </Text>
      ) : null}
    </View>
  );
}

// Split out so only animated hero numbers subscribe to theme colours;
// the hundreds of static list amounts stay className-only.
function RollingNumber({
  value,
  showFraction,
  style,
  tone,
}: {
  value: number;
  showFraction: boolean;
  style: Record<string, unknown>;
  tone: MoneyTone;
}) {
  const themeColors = useThemeColors();
  return (
    <NumberFlow
      value={value}
      locales="en-IN"
      format={{ minimumFractionDigits: 0, maximumFractionDigits: showFraction ? 2 : 0 }}
      respectMotionPreference
      style={{ ...style, color: themeColors[TONE_COLOR[tone]] as string }}
    />
  );
}
