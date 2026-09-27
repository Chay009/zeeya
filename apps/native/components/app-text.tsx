import { forwardRef } from "react";
import { StyleSheet, Text, type TextProps, type TextStyle } from "react-native";

import { appFontFamily, type AppFontWeight } from "@/lib/fonts";

// React Native's fontWeight is a string ("400".."900" or "normal"/"bold");
// Inter's package only ships 400/500/600/700/800, so anything else maps
// to its nearest available weight rather than silently falling through to
// no fontFamily at all (which would just re-introduce the platform
// default this component exists to replace).
const WEIGHT_TO_APP_WEIGHT: Record<string, AppFontWeight> = {
  normal: "regular",
  "400": "regular",
  "500": "medium",
  "600": "semibold",
  bold: "bold",
  "700": "bold",
  "800": "extrabold",
  "900": "extrabold",
};

// One style object per weight, built once — every Text used to allocate a
// fresh { fontFamily } object on every render.
const FONT_STYLE = new Map<AppFontWeight, TextStyle>();
function fontStyle(weight: AppFontWeight): TextStyle {
  let style = FONT_STYLE.get(weight);
  if (!style) {
    style = { fontFamily: appFontFamily(weight) };
    FONT_STYLE.set(weight, style);
  }
  return style;
}

function weightOf(style: TextProps["style"]): AppFontWeight {
  // Most Text here is className-styled with no `style` at all — skip the
  // flatten (a full style walk) entirely in that case.
  if (!style) return "regular";
  const fontWeight = StyleSheet.flatten(style)?.fontWeight;
  return fontWeight ? (WEIGHT_TO_APP_WEIGHT[String(fontWeight)] ?? "regular") : "regular";
}

// Drop-in replacement for React Native's Text — infers the right Inter
// weight from the style's fontWeight on Android, and leaves iOS's real
// system SF Pro completely untouched (see lib/fonts.ts). Existing
// `style={{ fontWeight: "800" }}` usages get the correct font automatically
// without every call site needing a manual fontFamily.
export const AppText = forwardRef<Text, TextProps>(({ style, ...props }, ref) => {
  const base = fontStyle(weightOf(style));
  return <Text ref={ref} style={style ? [base, style] : base} {...props} />;
});

AppText.displayName = "AppText";
