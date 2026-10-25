import { NumberFlow } from "number-flow-react-native";
import { StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

import { currencySymbol } from "@/components/ui/money";
import { appFontFamily } from "@/lib/fonts";

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
  const weight = String(flattened?.fontWeight ?? "400");
  const fallbackFamily =
    weight === "800" || weight === "900" || weight === "bold" ? "extrabold" : "regular";
  const fontFamily = flattened.fontFamily ?? appFontFamily(fallbackFamily);

  return (
    <NumberFlow
      value={value}
      locales="en-IN"
      format={{ maximumFractionDigits: 2 }}
      prefix={`${currencySymbol(currency)} `}
      animated={animated}
      respectMotionPreference
      style={{ ...flattened, fontFamily }}
      containerStyle={containerStyle}
    />
  );
}
