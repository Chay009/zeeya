import { PressableFeedback } from "heroui-native";
import type { ReactNode } from "react";
import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";
import { useThemeColors } from "@/components/ui/theme";
import { moneyFontFamily, moneyTextStyle } from "@/lib/fonts";

// The list row of the layered design: logo · name over date · amount with a
// tiny direction dot over its account or category. Two quiet lines a side,
// so a column of rows reads as one calm ledger. The amount stays ink; only
// the dot says in (green, up) or out (red, down).

export function LedgerRow({
  leading,
  title,
  subtitle,
  amount,
  direction,
  detail,
  onPress,
}: {
  leading: ReactNode;
  title: string;
  subtitle: string;
  amount: string;
  direction?: "income" | "expense" | "neutral";
  /** Under the amount: the account, category or kind. */
  detail?: string;
  onPress?: () => void;
}) {
  const colors = useThemeColors();
  const dot =
    direction === "income" ? colors.positive : direction === "expense" ? colors.negative : null;
  return (
    <PressableFeedback
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${title}, ${subtitle}, ${amount}${detail ? `, ${detail}` : ""}`}
      onPress={onPress}
      isDisabled={!onPress}
      // 64pt row; the amount column is a fixed width so every row's amounts
      // end on one edge and long names truncate instead of pushing them.
      className="min-h-16 flex-row items-center gap-3 py-2"
    >
      {leading}
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-body font-medium text-ink">
          {title}
        </Text>
        <Text numberOfLines={1} className="text-caption text-muted">
          {subtitle}
        </Text>
      </View>
      <View className="w-[104px] items-end">
        <View className="flex-row items-center gap-1.5">
          {dot ? (
            <View
              className="h-3.5 w-3.5 items-center justify-center rounded-full"
              style={{ backgroundColor: dot }}
            >
              <AppIcon
                name={direction === "income" ? "trend-up" : "trend-down"}
                size={9}
                color={colors.card}
                strokeWidth={2.4}
              />
            </View>
          ) : null}
          <Text
            numberOfLines={1}
            className="text-ink"
            style={{
              fontFamily: moneyFontFamily("medium"),
              fontSize: 15,
              lineHeight: 20,
              letterSpacing: -0.2,
              ...moneyTextStyle,
            }}
          >
            {amount}
          </Text>
        </View>
        {detail ? (
          <Text numberOfLines={1} className="text-caption text-muted">
            {detail}
          </Text>
        ) : null}
      </View>
    </PressableFeedback>
  );
}
