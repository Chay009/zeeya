import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { ShareBar } from "@/components/charts/share-bar";
import { IconTile } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/states";
import { useThemeColors, withAlpha } from "@/components/ui/theme";
import { categoryColor, categoryIcon } from "@/features/insights/category-visual";

import type { HomePreviewData } from "../data";

// Month's category mix: one share bar for the shape, then the top
// categories with their share. Same colour order as Analytics.

export function ThisWeekCategoriesTab({ data }: { data: HomePreviewData["cashflow"] }) {
  const colors = useThemeColors();

  if (data.categories.length === 0) {
    return (
      <EmptyState compact icon="pie-chart" title="No categories yet" body="Spending this month is grouped here." />
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
            color: categoryColor(colors.chart, index),
          }))}
        />
      </View>
      <View className="mt-3">
        {data.categories.slice(0, 5).map((category, index) => {
          const color = categoryColor(colors.chart, index);
          return (
            <View key={category.label} className="flex-row items-center gap-3 py-2.5">
              <IconTile icon={categoryIcon(category.label)} color={color} background={withAlpha(color, 0.14)} size={36} />
              <Text numberOfLines={1} className="min-w-0 flex-1 text-body font-medium text-ink">
                {category.label}
              </Text>
              <Text className="text-caption text-muted">{category.pct}%</Text>
              <Text numberOfLines={1} className="w-24 text-right text-body font-semibold text-ink">
                {category.amount}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
