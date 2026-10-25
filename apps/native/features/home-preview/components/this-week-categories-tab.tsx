import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { ShareBar } from "@/components/charts/share-bar";
import { CategoryTile } from "@/components/finance/category-tile";
import { EmptyBars } from "@/components/art/state-marks";
import { EmptyState } from "@/components/ui/states";
import { useThemeColors, withAlpha } from "@/components/ui/theme";

import type { HomePreviewData } from "../data";

// Month's category mix: one share bar for the shape, then the top
// categories with their share. The bar steps the one accent down by rank
// (lime → paler lime → grey) instead of a hue per category.

export function ThisWeekCategoriesTab({ data }: { data: HomePreviewData["cashflow"] }) {
  const colors = useThemeColors();
  const step = (index: number) =>
    index === 0
      ? colors.accent
      : index < 4
        ? withAlpha(colors.accent, 0.7 - index * 0.15)
        : colors.fillStrong;
  if (data.categories.length === 0) {
    return (
      <EmptyState
        compact
        icon="pie-chart"
        visual={<EmptyBars size={72} />}
        title="No categories yet"
        body="Spending this month is grouped here."
      />
    );
  }

  return (
    <View>
      <Text className="text-caption text-muted">This month</Text>
      <View className="mt-3">
        <ShareBar
          segments={data.categories.map((category, index) => ({
            key: category.label,
            value: category.pct,
            color: step(index),
          }))}
        />
      </View>
      <View className="mt-3">
        {data.categories.slice(0, 5).map((category) => {
          return (
            <View key={category.label} className="flex-row items-center gap-3 py-2">
              <CategoryTile label={category.label} size={40} />
              <Text numberOfLines={1} className="min-w-0 flex-1 text-body font-medium text-ink">
                {category.label}
              </Text>
              <Text className="w-10 text-right text-caption text-muted">{category.pct}%</Text>
              <Text numberOfLines={1} className="w-24 text-right text-body font-medium text-ink">
                {category.amount}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
