import { Platform } from "react-native";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { Inter_800ExtraBold } from "@expo-google-fonts/inter/800ExtraBold";
import { PlusJakartaSans_500Medium } from "@expo-google-fonts/plus-jakarta-sans/500Medium";
import { PlusJakartaSans_600SemiBold } from "@expo-google-fonts/plus-jakarta-sans/600SemiBold";
import { PlusJakartaSans_700Bold } from "@expo-google-fonts/plus-jakarta-sans/700Bold";
import { PlusJakartaSans_800ExtraBold } from "@expo-google-fonts/plus-jakarta-sans/800ExtraBold";

// SF Pro is Apple's system font and cannot be bundled for Android — its
// license restricts distribution to Apple platforms. iOS already renders
// in real SF Pro with no fontFamily override at all, so `undefined` there
// keeps that for free. Android gets Inter as the neutral body substitute.
//
// Plus Jakarta Sans is the display + money face: tighter numerals than
// Inter, warmer than Space Grotesk, and already a common fintech choice.
// It loads on BOTH platforms because neither OS ships it.
export const appFontsToLoad = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
};

export type AppFontWeight = "regular" | "medium" | "semibold" | "bold" | "extrabold";

const ANDROID_FONT_BY_WEIGHT: Record<AppFontWeight, string> = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  extrabold: "Inter_800ExtraBold",
};

export function appFontFamily(weight: AppFontWeight): string | undefined {
  return Platform.OS === "android" ? ANDROID_FONT_BY_WEIGHT[weight] : undefined;
}

export type DisplayFontWeight = "medium" | "semibold" | "bold" | "extrabold";

const DISPLAY_FONT_BY_WEIGHT: Record<DisplayFontWeight, string> = {
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extrabold: "PlusJakartaSans_800ExtraBold",
};

// Money amounts — balances, spend totals, pair-card figures.
export function moneyFontFamily(weight: DisplayFontWeight = "semibold"): string {
  return DISPLAY_FONT_BY_WEIGHT[weight];
}

// Screen titles and section headings.
export function headingFontFamily(weight: DisplayFontWeight = "bold"): string {
  return DISPLAY_FONT_BY_WEIGHT[weight];
}

// Pair with moneyFontFamily on Text for aligned currency columns.
export const moneyTextStyle = {
  fontVariant: ["tabular-nums" as const],
};
