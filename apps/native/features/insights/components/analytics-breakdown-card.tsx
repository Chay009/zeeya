import { useState } from "react";
import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { ShareBar } from "@/components/charts/share-bar";
import { IconTile, Segmented } from "@/components/ui/controls";
import { Row, RowGroup } from "@/components/ui/list";
import { Money } from "@/components/ui/money";
import { EmptyState } from "@/components/ui/states";
import { useThemeColors, withAlpha } from "@/components/ui/theme";
import { BrandLogo } from "@/features/home-preview/components/brand-logo";
import { merchantVisual } from "@/features/home-preview/data";
import { fromMinorUnits } from "@/lib/currency";

import { categoryColor, categoryIcon } from "../category-visual";
import type { InsightsCategorySlice, InsightsPresentation } from "../insights-presentation";

// "Where it went": one card, two lenses (category / merchant). The share bar
// gives the mix at a glance; rows give the numbers. Every row drills into
// the matching transactions.

type Lens = "categories" | "merchants";
const LENSES = [
  { value: "categories", label: "Categories" },
  { value: "merchants", label: "Merchants" },
] as const;
const ROW_LIMIT = 5;

function ChangeText({ percent }: { percent: number | null }) {
  if (percent === null || !Number.isFinite(percent) || Math.round(percent) === 0) return null;
  const up = percent > 0;
  return (
    <Text className={`mt-0.5 text-meta font-medium ${up ? "text-negative" : "text-positive"}`}>
      {up ? "↑" : "↓"} {Math.abs(Math.round(percent))}%
    </Text>
  );
}

export function AnalyticsBreakdownCard({
  categories,
  categoryTotal,
  presentation,
  currency,
  onOpenCategory,
  onOpenMerchant,
  onSeeAll,
}: {
  categories: InsightsCategorySlice[];
  categoryTotal: number;
  presentation: InsightsPresentation | null;
  currency: string;
  onOpenCategory: (category: string) => void;
  onOpenMerchant: (merchant: string) => void;
  onSeeAll: (lens: Lens) => void;
}) {
  const colors = useThemeColors();
  const [lens, setLens] = useState<Lens>("categories");
  const ranked = presentation?.topCategories ?? [];
  const vendors = presentation?.topVendors ?? [];

  const categoryRows = categories.slice(0, ROW_LIMIT).map((category, index) => ({
    ...category,
    color: categoryColor(colors.chart, index),
    change: ranked.find((row) => row.category === category.label)?.changePercent ?? null,
    share: categoryTotal > 0 ? Math.round((category.value / categoryTotal) * 100) : 0,
  }));
  const vendorTotal = vendors.reduce((sum, vendor) => sum + vendor.currentMinorUnits, 0);

  return (
    <View className="overflow-hidden rounded-card bg-card">
      <View className="px-4 pb-1 pt-4">
        <Segmented value={lens} options={LENSES} onChange={setLens} size="sm" />
      </View>

      {lens === "categories" ? (
        categoryRows.length === 0 ? (
          <EmptyState compact icon="pie-chart" title="No spending categorised yet" />
        ) : (
          <>
            <View className="px-4 pb-2 pt-4">
              <ShareBar
                segments={categories.map((category, index) => ({
                  key: category.label,
                  value: category.value,
                  color: categoryColor(colors.chart, index),
                }))}
              />
            </View>
            <RowGroup animated variant="transparent" inset={68} className="rounded-none">
              {categoryRows.map((row) => (
                <Row
                  key={row.label}
                  onPress={() => onOpenCategory(row.label)}
                  leading={
                    <IconTile
                      icon={categoryIcon(row.label)}
                      color={row.color}
                      background={withAlpha(row.color, 0.14)}
                    />
                  }
                  title={row.label}
                  subtitle={`${row.share}% of spending`}
                  trailing={<Money value={row.value} currency={currency} size="body" />}
                  trailingSubtitle={<ChangeText percent={row.change} />}
                />
              ))}
            </RowGroup>
          </>
        )
      ) : vendors.length === 0 ? (
        <EmptyState compact icon="bag" title="No merchants yet" />
      ) : (
        <RowGroup animated variant="transparent" inset={68} className="mt-2 rounded-none">
          {vendors.slice(0, ROW_LIMIT).map((vendor) => {
            const visual = merchantVisual(vendor.vendor);
            const share = vendorTotal > 0 ? Math.round((vendor.currentMinorUnits / vendorTotal) * 100) : 0;
            return (
              <Row
                key={vendor.identityKey ?? vendor.vendor}
                onPress={() => onOpenMerchant(vendor.vendor)}
                leading={
                  <BrandLogo
                    letter={vendor.vendor.charAt(0).toUpperCase() || "?"}
                    tile={visual.tile}
                    ink={visual.ink}
                    img={visual.img}
                    size={40}
                    radius={20}
                    iconRatio={0.6}
                  />
                }
                title={vendor.vendor}
                subtitle={`${vendor.transactionCount} payment${vendor.transactionCount === 1 ? "" : "s"} · ${share}%`}
                trailing={
                  <Money
                    value={fromMinorUnits(vendor.currentMinorUnits, currency)}
                    currency={currency}
                    size="body"
                  />
                }
                trailingSubtitle={<ChangeText percent={vendor.changePercent} />}
              />
            );
          })}
        </RowGroup>
      )}

      <View className="border-t border-divider">
        <Row
          onPress={() => onSeeAll(lens)}
          title={
            <Text className="text-body font-medium text-accent-deep">
              {lens === "categories" ? "See all categories" : "See all merchants"}
            </Text>
          }
          chevron
          className="min-h-[52px]"
        />
      </View>
    </View>
  );
}
