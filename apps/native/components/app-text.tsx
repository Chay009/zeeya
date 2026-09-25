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

function resolveFontFamily(style: TextStyle | undefined): string | undefined {
  const weight = style?.fontWeight ? String(style.fontWeight) : "400";
  const appWeight = WEIGHT_TO_APP_WEIGHT[weight] ?? "regular";
  return appFontFamily(appWeight);
}

// Drop-in replacement for React Native's Text — infers the right Inter
// weight from the style's fontWeight on Android, and leaves iOS's real
// system SF Pro completely untouched (see lib/fonts.ts). Existing
// `style={{ fontWeight: "800" }}` usages get the correct font automatically
// without every call site needing a manual fontFamily.
export const AppText = forwardRef<Text, TextProps>(({ style, ...props }, ref) => {
  const flattened = StyleSheet.flatten(style);
  return <Text ref={ref} style={[{ fontFamily: resolveFontFamily(flattened) }, style]} {...props} />;
});

AppText.displayName = "AppText";
