import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { formatMoney } from "@/features/dashboard/utils/format";
import { moneyFontFamily } from "@/lib/fonts";

import type { InsightsCategorySlice } from "../insights-presentation";
import { InsightsEmptyState, InsightsPanel } from "./insights-chrome";
import { ZeeyaDonutChart } from "./zeeya-donut-chart";

export function CategoryPanel({
  categories,
  currency,
  total,
  isLoading,
}: {
  categories: InsightsCategorySlice[];
  currency: string;
  total: number;
  isLoading: boolean;
}) {
  return (
    <InsightsPanel className="mt-3.5">
      <Text className="text-[13px] font-semibold tracking-wide text-muted">Categories</Text>

      {isLoading ? (
        <View className="mt-4 gap-3.5">
          {[0, 1, 2].map((row) => (
            <View key={row} className="h-11 rounded-xl bg-fill" />
          ))}
        </View>
      ) : categories.length === 0 || total <= 0 ? (
        <InsightsEmptyState
          icon="pie-chart"
          title="No categories yet"
          body="They show up here once spending is captured."
        />
      ) : (
        <View className="mt-2">
          <ZeeyaDonutChart data={categories} />
          {categories.map((category, index) => {
            const percentage = Math.round((category.value / total) * 100);
            return (
              <View
                key={category.label}
                className={`py-3 ${index === 0 ? "" : "border-t border-fill"}`}
              >
                <View className="flex-row items-baseline gap-2.5">
                  <Text numberOfLines={1} className="flex-1 text-subtitle font-semibold text-ink">
                    {category.label}
                  </Text>
                  <Text
                    className="text-subtitle text-ink"
                    style={{ fontFamily: moneyFontFamily("semibold") }}
                  >
                    {formatMoney(category.value, currency)}
                  </Text>
                </View>
                <View className="mt-2 h-1.5 overflow-hidden rounded-pill bg-fill-strong">
                  <View
                    className="h-full rounded-pill"
                    style={{
                      width: `${Math.min(100, Math.max(4, percentage))}%`,
                      backgroundColor: category.color,
                    }}
                  />
                </View>
                <Text className="mt-1.5 text-caption text-muted">{percentage}%</Text>
              </View>
            );
          })}
        </View>
      )}
    </InsightsPanel>
  );
}
