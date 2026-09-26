import { Surface } from "heroui-native";
import { Platform, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon, type AppIconName } from "@/components/icon";
import { formatMoney } from "@/features/dashboard/utils/format";
import { useThemeColors } from "@/components/ui/theme";
import type { MonthlySpendComparison, TopCategory } from "../insights-data";

const tileShadow = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
  },
  android: { elevation: 2 },
  default: {},
});

const CATEGORY_ICONS: Record<string, AppIconName> = {
  food: "food",
  dining: "food",
  grocery: "cart",
  groceries: "cart",
  travel: "airplane",
  transport: "car",
  shopping: "bag",
  entertainment: "film",
  bills: "receipt",
  utilities: "flash",
  health: "health",
  education: "school",
  rent: "home",
  housing: "home",
};

function iconForCategory(label: string): AppIconName | null {
  const normalized = label.toLowerCase();
  const match = Object.entries(CATEGORY_ICONS).find(([key]) => normalized.includes(key));
  return match?.[1] ?? null;
}

function MonthComparisonTile({
  comparison,
  currency,
}: {
  comparison: MonthlySpendComparison;
  currency: string;
}) {
  const colors = useThemeColors();
  const { currentTotal, percentChange } = comparison;
  const isIncrease = percentChange !== null && percentChange > 0;
  const isDecrease = percentChange !== null && percentChange < 0;

  return (
    <Surface
      asChild
      style={{ flex: 1, borderRadius: 20, backgroundColor: "white", padding: 16, ...tileShadow }}
    >
      <View>
        <Text style={{ fontSize: 12, color: colors.muted }}>Spending this month</Text>
        {percentChange !== null && (
          <Text
            style={{
              marginTop: 6,
              fontSize: 13,
              fontWeight: "700",
              color: isIncrease ? colors.negative : isDecrease ? colors.positive : colors.muted,
            }}
          >
            {isIncrease ? "+" : ""}
            {percentChange.toFixed(0)}% vs last month
          </Text>
        )}
        <Text style={{ marginTop: 6, fontSize: 22, fontWeight: "800", color: colors.ink }}>
          {formatMoney(currentTotal, currency)}
        </Text>
      </View>
    </Surface>
  );
}

function TopCategoryTile({ category }: { category: TopCategory | null }) {
  const colors = useThemeColors();
  const icon = category ? iconForCategory(category.label) : null;
  return (
    <Surface
      asChild
      style={{ flex: 1, borderRadius: 20, backgroundColor: "white", padding: 16, ...tileShadow }}
    >
      <View>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: category ? `${category.color}26` : "#eef1ee",
          }}
        >
        {icon && category ? <AppIcon name={icon} size={17} color={category.color} /> : null}
        </View>
        <Text style={{ marginTop: 10, fontSize: 12, color: colors.muted }}>Top category</Text>
        <Text
          numberOfLines={1}
          style={{ marginTop: 2, fontSize: 15, fontWeight: "800", color: colors.ink }}
        >
          {category?.label ?? "No spending yet"}
        </Text>
      </View>
    </Surface>
  );
}

// The month-over-month change and top-spend category — both derived from
// real transaction history (dashboard.recent holds every captured
// message, not just the current month), never estimated or fabricated.
export function SpendingSummaryTiles({
  comparison,
  currency,
  topCategory,
}: {
  comparison: MonthlySpendComparison;
  currency: string;
  topCategory: TopCategory | null;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
      <MonthComparisonTile comparison={comparison} currency={currency} />
      <TopCategoryTile category={topCategory} />
    </View>
  );
}
