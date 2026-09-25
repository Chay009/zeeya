import type { TextProps } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { moneyFontFamily, moneyTextStyle, type DisplayFontWeight } from "@/lib/fonts";

export function MoneyText({
  weight = "semibold",
  tabular = true,
  style,
  ...props
}: TextProps & {
  weight?: DisplayFontWeight;
  tabular?: boolean;
}) {
  return (
    <Text
      style={[
        { fontFamily: moneyFontFamily(weight) },
        tabular ? moneyTextStyle : undefined,
        style,
      ]}
      {...props}
    />
  );
}
