import { StyleSheet, type ViewStyle } from "react-native";

import { useThemeColors, withAlpha } from "./theme";

// Cards float a little above the page instead of being flat white blocks on
// grey: a hairline contact shadow plus a wide, soft, low drop — the depth a
// premium finance UI reads as "crafted". One token, so every card lifts the
// same amount. "raised" is for the card that leads a screen.
//
// Dark mode has no light to cast shadows with, so cards are separated by a
// faint edge instead.
const LIGHT: Record<CardElevation, string> = {
  card: "0px 1px 2px rgba(11, 11, 13, 0.04), 0px 12px 28px -14px rgba(11, 11, 13, 0.16)",
  raised: "0px 1px 2px rgba(11, 11, 13, 0.05), 0px 18px 40px -18px rgba(11, 11, 13, 0.24)",
};

export type CardElevation = "card" | "raised";

export function useCardElevation(level: CardElevation = "card"): ViewStyle {
  const colors = useThemeColors();
  if (colors.isDark) {
    return {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha(colors.onHero, level === "raised" ? 0.1 : 0.07),
    };
  }
  return { boxShadow: LIGHT[level] };
}
