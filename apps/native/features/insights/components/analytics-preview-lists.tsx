import { Pressable, View } from "react-native";
import { Circle, Svg } from "react-native-svg";

import { AppText as Text } from "@/components/app-text";
import { AppIcon, type AppIconName } from "@/components/icon";
import { MoneyText } from "@/components/native-ui/money-text";
import { ActivityItemRow } from "@/features/home-preview/components/activity-section";
import { EmptyNote } from "@/features/home-preview/components/empty-note";
import { BrandLogo } from "@/features/home-preview/components/brand-logo";
import { merchantVisual } from "@/features/home-preview/data";
import { formatMoney } from "@/features/dashboard/utils/format";
import { hp } from "@/features/home-preview/theme";
import { fromMinorUnits } from "@/lib/currency";

import { analyticsTrendChip } from "../analytics-trend";
import type { AnalyticsDirection } from "../analytics-scope";
import type {
  InsightsCategorySlice,
  InsightsPresentation,
} from "../insights-presentation";
import { mapInsightsTransactionToActivityRow } from "../insights-transaction-activity-row";
import type { InsightsTransactionRow } from "../insights-transaction-presentation";
import { AnalyticsPreviewSection } from "./analytics-preview-section";

const PREVIEW_ROW_LIMIT = 3;
const RING_SIZE = 48;
const RING_RADIUS = 18;
const RING_STROKE = 4;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const CATEGORY_ICONS: Record<string, AppIconName> = {
  food: "food",
  dining: "food",
  grocery: "cart",
  travel: "airplane",
  shopping: "bag",
  bills: "receipt",
};

function categoryIcon(label: string): AppIconName {
  const normalized = label.toLowerCase();
  const match = Object.entries(CATEGORY_ICONS).find(([key]) => normalized.includes(key));
  return match?.[1] ?? "pie-chart";
}

function translucent(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  if (value.length !== 6) return hex;
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function CategoryRing({ pct, color }: { pct: number; color: string }) {
  const visiblePct = Math.max(0, Math.min(100, pct));
  const dashOffset = RING_CIRCUMFERENCE * (1 - visiblePct / 100);

  return (
    <View className="h-12 w-12 items-center justify-center">
      <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="transparent"
          stroke={hp.track}
          strokeWidth={RING_STROKE}
        />
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="transparent"
          stroke={color}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      </Svg>
      <View className="absolute inset-0 items-center justify-center">
        <Text className="text-meta font-extrabold text-ink">{visiblePct}%</Text>
      </View>
    </View>
  );
}

export function AnalyticsCategoriesPreview({
  categories,
  currency,
  total,
  presentation,
  onSeeAll,
  bare = false,
}: {
  categories: InsightsCategorySlice[];
  currency: string;
  total: number;
  presentation: InsightsPresentation | null;
  isLoading?: boolean;
  onSeeAll: () => void;
  bare?: boolean;
}) {
  const preview = categories.slice(0, PREVIEW_ROW_LIMIT);
  const ranked = presentation?.topCategories ?? [];

  if (preview.length === 0 || total <= 0) {
    return bare ? <Text className="py-6 text-caption text-muted">No categories in this period.</Text> : null;
  }

  return (
    <AnalyticsPreviewSection title="Categories" onSeeAll={onSeeAll} bare={bare}>
      <View>
        {preview.map((category) => {
          const match = ranked.find((row) => row.category === category.label);
          const chip = analyticsTrendChip(match?.changePercent ?? null);
          const percentage = Math.round((category.value / total) * 100);

          return (
            <View key={`category:${category.label}`} className="flex-row items-center gap-3 py-3">
              <View
                className="h-11 w-11 shrink-0 items-center justify-center rounded-[14px]"
                style={{ backgroundColor: translucent(category.color, 0.14) }}
              >
                <AppIcon name={categoryIcon(category.label)} size={20} color={category.color} />
              </View>
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-subtitle font-extrabold text-ink">
                  {category.label}
                </Text>
                <View className="mt-0.5 flex-row flex-wrap items-center gap-x-2">
                  <MoneyText className="text-caption font-semibold text-ink">
                    {formatMoney(category.value, currency)}
                  </MoneyText>
                  {chip ? (
                    <Text className={`text-caption font-bold ${chip.className}`}>{chip.label}</Text>
                  ) : null}
                </View>
              </View>
              <CategoryRing pct={percentage} color={category.color} />
            </View>
          );
        })}
      </View>
    </AnalyticsPreviewSection>
  );
}

export function AnalyticsTransactionsPreview({
  direction,
  items,
  status = "ready",
  error,
  onSeeAll,
  onSelect,
  onRetry,
  bare = false,
}: {
  direction: AnalyticsDirection;
  items: InsightsTransactionRow[];
  status?: "loading" | "ready" | "error";
  error?: string | null;
  onSeeAll: () => void;
  onSelect: (item: InsightsTransactionRow) => void;
  onRetry?: () => void;
  bare?: boolean;
}) {
  const preview = items.slice(0, PREVIEW_ROW_LIMIT);
  const title = direction === "income" ? "Recent income" : "Recent spending";
  const hasRows = preview.length > 0;

  return (
    <AnalyticsPreviewSection title={title} onSeeAll={hasRows ? onSeeAll : undefined} bare={bare}>
      {status === "loading" ? (
        <Text className="text-caption text-muted-soft">Loading recent transactions…</Text>
      ) : status === "error" ? (
        <View>
          <Text className="text-caption font-bold text-ink">Couldn&apos;t load transactions</Text>
          <Text className="mt-1 text-caption text-muted-soft" numberOfLines={3}>
            {error ?? "Try again in a moment."}
          </Text>
          {onRetry ? (
            <Pressable accessibilityRole="button" onPress={onRetry} className="mt-2 self-start">
              <Text className="text-caption font-bold text-accent-deep">Retry</Text>
            </Pressable>
          ) : null}
        </View>
      ) : hasRows ? (
        <View>
          {preview.map((item, index) => (
            <ActivityItemRow
              key={`preview:${item.key}:${item.date}`}
              item={mapInsightsTransactionToActivityRow(item, direction)}
              index={index}
              onPress={() => onSelect(item)}
            />
          ))}
        </View>
      ) : (
        <EmptyNote
          icon="receipt"
          title={direction === "income" ? "No income yet" : "No spending yet"}
          body={
            direction === "income"
              ? "Captured income will show up here once SMS sync finds salary, refunds, or credits."
              : "Captured expenses will show up here once SMS sync finds debits and payments."
          }
        />
      )}
    </AnalyticsPreviewSection>
  );
}

export function AnalyticsVendorsPreview({
  presentation,
  currency,
  onSeeAll,
  bare = false,
}: {
  presentation: InsightsPresentation | null;
  currency: string;
  onSeeAll: () => void;
  bare?: boolean;
}) {
  const vendors = presentation?.topVendors.slice(0, PREVIEW_ROW_LIMIT) ?? [];

  if (vendors.length === 0) {
    return bare ? <Text className="py-6 text-caption text-muted">No merchants in this period.</Text> : null;
  }

  return (
    <AnalyticsPreviewSection title="Top vendors" onSeeAll={onSeeAll} bare={bare}>
      <View>
        {vendors.map((vendor, index) => {
          const chip = analyticsTrendChip(vendor.changePercent);
          const visual = merchantVisual(vendor.vendor);

          return (
            <View key={`vendor:${vendor.vendor}`} className="flex-row items-center gap-3 py-3">
              <View className="h-7 w-7 shrink-0 items-center justify-center rounded-full bg-frost">
                <Text className="text-meta font-extrabold text-muted">{index + 1}</Text>
              </View>
              <BrandLogo
                letter={vendor.vendor.charAt(0).toUpperCase()}
                tile={visual.tile}
                ink={visual.ink}
                img={visual.img ?? undefined}
                size={40}
                radius={14}
                iconRatio={0.7}
              />
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-subtitle font-extrabold text-ink">
                  {vendor.vendor}
                </Text>
                {chip ? (
                  <Text className={`mt-0.5 text-caption font-bold ${chip.className}`}>{chip.label}</Text>
                ) : null}
              </View>
              <MoneyText className="text-subtitle font-extrabold text-ink">
                {formatMoney(fromMinorUnits(vendor.currentMinorUnits, currency), currency)}
              </MoneyText>
            </View>
          );
        })}
      </View>
    </AnalyticsPreviewSection>
  );
}
