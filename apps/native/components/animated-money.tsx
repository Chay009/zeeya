import { NumberFlow } from "number-flow-react-native";
import { StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

import { appFontFamily } from "@/lib/fonts";

function currencyPrefix(currency: string): string {
  return currency === "INR" ? "₹ " : `${currency} `;
}

export function AnimatedMoney({
  value,
  currency,
  style,
  containerStyle,
  animated = true,
}: {
  value: number;
  currency: string;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  animated?: boolean;
}) {
  const flattened = StyleSheet.flatten(style) ?? {};
  const resolvedContainerStyle = StyleSheet.flatten(containerStyle) ?? undefined;
  const weight = String(flattened?.fontWeight ?? "400");
  const fallbackFamily =
    weight === "800" || weight === "900" || weight === "bold" ? "extrabold" : "regular";
  const fontFamily = flattened.fontFamily ?? appFontFamily(fallbackFamily);

  return (
    <NumberFlow
      value={value}
      locales="en-IN"
      format={{ maximumFractionDigits: 2 }}
      prefix={currencyPrefix(currency)}
      animated={animated}
      respectMotionPreference
      style={{ ...flattened, fontFamily }}
      containerStyle={resolvedContainerStyle}
    />
  );
}
