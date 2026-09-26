import { PressableFeedback } from "heroui-native";
import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";
import { ProgressBar } from "@/components/ui/controls";
import { useThemeColors } from "@/components/ui/theme";
import { moneyFontFamily } from "@/lib/fonts";

// Budget on Home is one glanceable line of truth: spent vs limit, a bar,
// and what's left. Tapping opens the Budget view in Analytics.

export function BudgetCard({
  monthLabel,
  spent,
  limit,
  usedPercent,
  remaining,
  onOpen,
}: {
  monthLabel: string;
  spent: string;
  limit: string | null;
  usedPercent: number | null;
  remaining: string | null;
  onOpen?: () => void;
}) {
  const colors = useThemeColors();
  const hasBudget = limit !== null && usedPercent !== null;
  const used = hasBudget ? usedPercent / 100 : 0;
  const barColor = used >= 1 ? colors.negative : used > 0.85 ? colors.warning : colors.chartLine;

  return (
    <PressableFeedback
      accessibilityRole="button"
      accessibilityLabel="Open budget"
      onPress={onOpen}
      isDisabled={!onOpen}
      className="overflow-hidden rounded-card bg-card p-5"
    >
      <PressableFeedback.Highlight />
      <View className="flex-row items-center justify-between">
        <Text className="text-caption font-semibold text-muted">{monthLabel || "This month"}</Text>
        <AppIcon name="chevron-right" size={14} color={colors.faint} />
      </View>

      {hasBudget ? (
        <>
          <View className="mt-2 flex-row items-baseline gap-1.5">
            <Text
              numberOfLines={1}
              className="text-title tracking-tight text-ink"
              style={{ fontFamily: moneyFontFamily("bold") }}
            >
              {spent}
            </Text>
            <Text numberOfLines={1} className="text-caption text-muted">
              of {limit}
            </Text>
          </View>
          <ProgressBar value={used} color={barColor} height={8} className="mt-4" />
          <View className="mt-2 flex-row justify-between">
            <Text className="text-meta text-muted">{usedPercent}% used</Text>
            <Text className={`text-meta font-medium ${used >= 1 ? "text-negative" : "text-ink-soft"}`}>
              {used >= 1 ? "Over budget" : remaining ? `${remaining} left` : "On track"}
            </Text>
          </View>
        </>
      ) : (
        <View className="mt-2">
          <Text
            numberOfLines={1}
            className="text-title tracking-tight text-ink"
            style={{ fontFamily: moneyFontFamily("bold") }}
          >
            {spent}
          </Text>
          <Text className="mt-1 text-caption text-muted">Spent so far · set a monthly budget to track pace</Text>
        </View>
      )}
    </PressableFeedback>
  );
}
