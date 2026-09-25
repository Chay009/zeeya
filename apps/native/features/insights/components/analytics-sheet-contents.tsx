import { useEffect, useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon, type AppIconName } from "@/components/icon";
import { BrandLogo } from "@/features/home-preview/components/brand-logo";
import { merchantVisual } from "@/features/home-preview/data";
import { formatMoney } from "@/features/dashboard/utils/format";
import { hp } from "@/features/home-preview/theme";
import type { SubscriptionSummary } from "@/lib/dashboard-data";
import { fromMinorUnits } from "@/lib/currency";
import { moneyFontFamily } from "@/lib/fonts";

import { INSIGHTS_TIME_SCOPES, scopeLabel, type InsightsTimeScope } from "../analytics-scope";
import { AnalyticsFilterSelect } from "./analytics-controls";
import { analyticsTrendChip } from "../analytics-trend";
import type { AnalyticsTransactionFocus } from "../analytics-transaction-focus";
import {
  TRANSACTION_FILTER_CHIPS,
  transactionMatchesFilter,
  type TransactionFilterChip,
} from "../analytics-transaction-filters";
import type { AnalyticsDirection, AnalyticsTab } from "../analytics-scope";
import type { InsightsCategorySlice, InsightsPresentation } from "../insights-presentation";
import type { InsightsTransactionRow } from "../insights-transaction-presentation";
import { analyticsTransactionRowKey } from "../analytics-transaction-row-key";
import { EmptyNote } from "@/features/home-preview/components/empty-note";

import { AnalyticsSheetFilledCta, AnalyticsSheetOutlineCta } from "./analytics-sheet-cta";
import { analyticsRowStyles } from "./analytics-row-styles";
import { AnalyticsTransactionRow } from "./analytics-transaction-row";
import { ZeeyaDonutChart } from "./zeeya-donut-chart";

const CATEGORY_ICONS: Record<string, AppIconName> = {
  food: "food",
  dining: "food",
  grocery: "cart",
  travel: "airplane",
  shopping: "bag",
  bills: "receipt",
};

type SubscriptionTier = "essential" | "likely" | "optional";

function categoryIcon(label: string): AppIconName {
  const normalized = label.toLowerCase();
  const match = Object.entries(CATEGORY_ICONS).find(([key]) => normalized.includes(key));
  return match?.[1] ?? "pie-chart";
}

function subscriptionTier(subscription: SubscriptionSummary): SubscriptionTier {
  if (subscription.confidence === "possible") return "optional";
  if (subscription.count >= 3) return "essential";
  return "likely";
}

function tierLabel(tier: SubscriptionTier): string {
  if (tier === "essential") return "Essential";
  if (tier === "likely") return "Likely";
  return "Optional";
}

function tierChipClass(tier: SubscriptionTier): string {
  if (tier === "essential") return "bg-accent-soft text-accent-deep";
  if (tier === "likely") return "bg-[#fff4e5] text-[#c76a00]";
  return "bg-[#f3ecff] text-[#6d4aff]";
}

function formatNextCharge(lastDate: number): string {
  const next = new Date(lastDate);
  next.setMonth(next.getMonth() + 1);
  return `Next charge ${next.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
}

function groupTransactionsByMonth(items: InsightsTransactionRow[]): Array<{
  title: string;
  items: InsightsTransactionRow[];
}> {
  const groups = new Map<string, InsightsTransactionRow[]>();
  for (const item of items) {
    const bucket = groups.get(item.monthGroup) ?? [];
    bucket.push(item);
    groups.set(item.monthGroup, bucket);
  }
  return Array.from(groups.entries()).map(([title, rows]) => ({ title, items: rows }));
}

export function AnalyticsCategoriesSheetContent({
  at,
  tab,
  categories,
  categoryTotal,
  currency,
  presentation,
  isLoading,
  onViewTransactions,
}: {
  at: Date;
  tab: AnalyticsTab;
  categories: InsightsCategorySlice[];
  categoryTotal: number;
  currency: string;
  presentation: InsightsPresentation | null;
  isLoading: boolean;
  onViewTransactions: (category: string) => void;
}) {
  const ranked = presentation?.topCategories ?? [];
  const topCategory = categories[0]?.label ?? "category";

  return (
    <View className="pb-4">
      <View style={analyticsRowStyles.chartDonutRow}>
        <View style={analyticsRowStyles.donutSlot}>
          <ZeeyaDonutChart data={categories} isLoading={isLoading} size={156} />
          {!isLoading && categoryTotal > 0 ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                className="text-[18px] font-bold text-ink"
                style={{ fontFamily: moneyFontFamily("bold") }}
              >
                {formatMoney(categoryTotal, currency)}
              </Text>
              <Text className="mt-0.5 text-[10px] font-semibold text-muted">Total spend</Text>
            </View>
          ) : null}
        </View>

        <View style={analyticsRowStyles.legendColumn}>
          {categories.slice(0, 6).map((category) => {
            const percentage =
              categoryTotal > 0 ? Math.round((category.value / categoryTotal) * 100) : 0;
            return (
              <View key={category.label} style={analyticsRowStyles.legendRow}>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: category.color,
                  }}
                />
                <Text numberOfLines={1} style={[analyticsRowStyles.grow, { fontSize: 12 }]}>
                  {category.label}
                </Text>
                <Text className="text-caption font-semibold text-muted">{percentage}%</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View className="mt-4">
        {categories.map((category, index) => {
          const match = ranked.find((row) => row.category === category.label);
          const chip = analyticsTrendChip(match?.changePercent ?? null);
          const percentage =
            categoryTotal > 0 ? Math.round((category.value / categoryTotal) * 100) : 0;
          return (
            <View
              key={category.label}
              style={[
                analyticsRowStyles.row,
                {
                  paddingVertical: 12,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: hp.borderSoft,
                  columnGap: 12,
                },
              ]}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: `${category.color}26`,
                }}
              >
                <AppIcon name={categoryIcon(category.label)} size={16} color={category.color} />
              </View>
              <Text numberOfLines={1} style={analyticsRowStyles.grow} className="text-subtitle font-semibold text-ink">
                {category.label}
              </Text>
              <Text
                style={{ width: 76, textAlign: "right", fontFamily: moneyFontFamily("semibold") }}
                className="text-subtitle font-semibold text-ink"
              >
                {formatMoney(category.value, currency)}
              </Text>
              <Text style={{ width: 32, textAlign: "right" }} className="text-caption font-semibold text-muted">
                {percentage}%
              </Text>
              {chip ? (
                <Text
                  style={{ width: 40, textAlign: "right" }}
                  className={`text-caption font-bold ${chip.className}`}
                >
                  {chip.label}
                </Text>
              ) : (
                <View style={{ width: 40 }} />
              )}
            </View>
          );
        })}
      </View>

      <AnalyticsSheetOutlineCta
        label={`View transactions for ${topCategory} →`}
        onPress={() => onViewTransactions(topCategory)}
      />
    </View>
  );
}

export function AnalyticsTransactionsSheetContent({
  direction,
  items,
  status,
  error,
  onRetry,
  onSelect,
  focus,
  focusKey,
}: {
  direction: AnalyticsDirection;
  items: InsightsTransactionRow[];
  status: "loading" | "ready" | "error";
  error: string | null;
  onRetry: () => void;
  onSelect: (item: InsightsTransactionRow) => void;
  focus: AnalyticsTransactionFocus;
  focusKey: number;
}) {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<TransactionFilterChip>("All");

  useEffect(() => {
    if (!focus) {
      setQuery("");
      setActiveFilter("All");
      return;
    }
    setQuery(focus.searchQuery);
    setActiveFilter(focus.chip ?? "All");
  }, [focus, focusKey]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const matchesQuery =
        query.trim().length === 0 ||
        item.name.toLowerCase().includes(query.trim().toLowerCase());
      return matchesQuery && transactionMatchesFilter(item, activeFilter);
    });
  }, [activeFilter, items, query]);

  const groups = groupTransactionsByMonth(filtered);

  return (
    <View className="pb-4">
      <View className="flex-row items-center rounded-pill border border-border-soft bg-frost px-3 py-2.5">
        <AppIcon name="search" size={16} color={hp.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search transactions"
          placeholderTextColor={hp.muted}
          className="ml-2 flex-1 text-subtitle text-ink"
          accessibilityLabel="Search transactions"
        />
      </View>

      <View className="mt-3 flex-row flex-wrap gap-2">
        {TRANSACTION_FILTER_CHIPS.map((filter) => {
          const selected = activeFilter === filter;
          return (
            <Pressable
              key={filter}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setActiveFilter(filter)}
              className={`rounded-pill px-3 py-1.5 ${selected ? "bg-accent" : "border border-border-soft bg-card"}`}
            >
              <Text
                className={`text-caption font-bold ${selected ? "text-on-accent" : "text-ink-soft"}`}
              >
                {filter}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {status === "error" ? (
        <View className="mt-4">
          <Text className="text-caption text-muted">{error ?? "Couldn't load transactions."}</Text>
          <Pressable accessibilityRole="button" onPress={onRetry} className="mt-2 self-start">
            <Text className="text-caption font-bold text-accent-deep">Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {status === "loading" ? (
        <Text className="mt-4 text-caption text-muted-soft">Loading recent transactions…</Text>
      ) : groups.length === 0 ? (
        <EmptyNote
          icon="receipt"
          title={direction === "income" ? "No income yet" : "No spending yet"}
          body={
            query.trim().length > 0 || activeFilter !== "All"
              ? "Nothing matched this search or filter. Try clearing the search or choosing All."
              : direction === "income"
                ? "Captured income will show up here once SMS sync finds salary, refunds, or credits."
                : "Captured expenses will show up here once SMS sync finds debits and payments."
          }
        />
      ) : (
        <View style={{ marginTop: 8 }}>
          {groups.map((group) => {
            return (
              <View key={group.title} style={{ marginTop: 12 }}>
                <Text className="text-caption font-bold text-muted">{group.title}</Text>
                <View>
                  {group.items.map((item, index) => (
                    <AnalyticsTransactionRow
                      key={analyticsTransactionRowKey(item, index, group.title)}
                      item={item}
                      index={index}
                      direction={direction}
                      onPress={() => onSelect(item)}
                    />
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

export function AnalyticsSubscriptionsSheetContent({
  presentation,
}: {
  presentation: InsightsPresentation;
}) {
  const [activeTier, setActiveTier] = useState<SubscriptionTier | "all">("all");
  const subscriptions = presentation.subscriptions;
  const currency = presentation.currency;
  const rows = subscriptions.top;

  const tierCounts = useMemo(() => {
    const counts = { essential: 0, likely: 0, optional: 0 };
    for (const row of rows) {
      counts[subscriptionTier(row)] += 1;
    }
    return counts;
  }, [rows]);

  const tierTotals = useMemo(() => {
    const totals = { essential: 0, likely: 0, optional: 0 };
    for (const row of rows) {
      totals[subscriptionTier(row)] += row.amountMinorUnits;
    }
    return totals;
  }, [rows]);

  const filtered =
    activeTier === "all" ? rows : rows.filter((row) => subscriptionTier(row) === activeTier);

  const chips: Array<{ key: SubscriptionTier | "all"; label: string }> = [
    { key: "all", label: `All (${rows.length})` },
    { key: "essential", label: `Essential (${tierCounts.essential})` },
    { key: "likely", label: `Likely (${tierCounts.likely})` },
    { key: "optional", label: `Optional (${tierCounts.optional})` },
  ];

  return (
    <View className="pb-4">
      <Text
        className="text-[28px] font-bold text-ink"
        style={{ fontFamily: moneyFontFamily("bold") }}
      >
        {formatMoney(fromMinorUnits(subscriptions.monthlyCommittedMinorUnits, currency), currency)}
        <Text className="text-[18px] font-semibold text-muted"> / month</Text>
      </Text>
      <Text className="mt-1 text-caption text-muted">
        {subscriptions.activeCount} active subscription{subscriptions.activeCount === 1 ? "" : "s"}
      </Text>

      <View className="mt-3 flex-row items-center">
        {rows.slice(0, 4).map((subscription, index) => {
          const visual = merchantVisual(subscription.merchant);
          return (
            <View key={subscription.id} style={{ marginLeft: index === 0 ? 0 : -8 }}>
              <BrandLogo
                letter={subscription.merchant.charAt(0).toUpperCase()}
                tile={visual.tile}
                ink={visual.ink}
                img={visual.img ?? undefined}
                size={34}
                radius={12}
              />
            </View>
          );
        })}
      </View>

      <View className="mt-4 flex-row flex-wrap gap-2">
        {chips.map((chip) => {
          const selected = activeTier === chip.key;
          return (
            <Pressable
              key={chip.key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setActiveTier(chip.key)}
              className={`rounded-pill px-3 py-1.5 ${selected ? "bg-ink" : "border border-border-soft bg-card"}`}
            >
              <Text
                className={`text-caption font-bold ${selected ? "text-on-ink" : "text-ink-soft"}`}
              >
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View className="mt-2">
        {filtered.map((subscription, index) => {
          const visual = merchantVisual(subscription.merchant);
          const tier = subscriptionTier(subscription);
          return (
            <View
              key={subscription.id}
              className={`flex-row items-center gap-3 py-3 ${index === 0 ? "" : "border-t border-frost"}`}
            >
              <BrandLogo
                letter={subscription.merchant.charAt(0).toUpperCase()}
                tile={visual.tile}
                ink={visual.ink}
                img={visual.img ?? undefined}
                size={40}
                radius={14}
              />
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-subtitle font-semibold text-ink">
                  {subscription.merchant}
                </Text>
                <Text className="mt-0.5 text-caption text-muted">
                  {formatNextCharge(subscription.lastDate)}
                </Text>
              </View>
              <View className="items-end gap-1">
                <Text
                  className="text-subtitle font-semibold text-ink"
                  style={{ fontFamily: moneyFontFamily("semibold") }}
                >
                  {formatMoney(
                    fromMinorUnits(subscription.amountMinorUnits, currency),
                    currency,
                  )}
                  /mo
                </Text>
                <Text className={`rounded-pill px-2 py-0.5 text-[10px] font-bold ${tierChipClass(tier)}`}>
                  {tierLabel(tier)}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <View style={[analyticsRowStyles.subCardRow, { marginTop: 16, columnGap: 8 }]}>
        {(["essential", "likely", "optional"] as const).map((tier) => (
          <View
            key={tier}
            style={analyticsRowStyles.subCard}
            className="rounded-[16px] border border-border-soft bg-frost px-3 py-2.5"
          >
            <Text
              className="text-subtitle font-bold text-ink"
              style={{ fontFamily: moneyFontFamily("bold") }}
            >
              {formatMoney(fromMinorUnits(tierTotals[tier], currency), currency)}
            </Text>
            <Text className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
              {tierLabel(tier)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function AnalyticsVendorsSheetContent({
  currency,
  currencies,
  scope,
  onScopeChange,
  onCurrencyChange,
  presentation,
  onViewTransactions,
}: {
  currency: string;
  currencies: string[];
  scope: InsightsTimeScope;
  onScopeChange: (scope: InsightsTimeScope) => void;
  onCurrencyChange: (currency: string) => void;
  presentation: InsightsPresentation;
  onViewTransactions: (vendor: string) => void;
}) {
  const vendors = presentation.topVendors.slice(0, 8);
  const topVendor = vendors[0]?.vendor ?? "vendor";

  return (
    <View className="pb-4">
      <View className="flex-row gap-2">
        <AnalyticsFilterSelect
          icon="calendar"
          label={scopeLabel(scope)}
          accessibilityLabel={`Time range ${scopeLabel(scope)}`}
          value={scope}
          options={INSIGHTS_TIME_SCOPES.map((item) => ({ value: item.value, label: item.label }))}
          onChange={(next) => onScopeChange(next as InsightsTimeScope)}
        />
        <AnalyticsFilterSelect
          icon="rupee-receipt"
          label={currency}
          accessibilityLabel={`Currency ${currency}`}
          value={currency}
          options={(currencies.length > 0 ? currencies : [currency]).map((code) => ({
            value: code,
            label: code,
          }))}
          onChange={onCurrencyChange}
        />
      </View>

      <View className="mt-3">
        {vendors.map((vendor, index) => {
          const visual = merchantVisual(vendor.vendor);
          const chip = analyticsTrendChip(vendor.changePercent);
          return (
            <View
              key={`${vendor.vendor}:${index}`}
              className={`flex-row items-center gap-3 py-3 ${index === 0 ? "" : "border-t border-frost"}`}
            >
              <View className="h-8 w-8 items-center justify-center rounded-full bg-frost">
                <Text className="text-caption font-extrabold text-ink">{index + 1}</Text>
              </View>
              <BrandLogo
                letter={vendor.vendor.charAt(0).toUpperCase()}
                tile={visual.tile}
                ink={visual.ink}
                img={visual.img ?? undefined}
                size={36}
                radius={12}
              />
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-subtitle font-semibold text-ink">
                  {vendor.vendor}
                </Text>
                <Text className="mt-0.5 text-caption text-muted">
                  {vendor.transactionCount} txn{vendor.transactionCount === 1 ? "" : "s"}
                </Text>
              </View>
              <View className="items-end">
                <Text
                  className="text-subtitle font-semibold text-ink"
                  style={{ fontFamily: moneyFontFamily("semibold") }}
                >
                  {formatMoney(fromMinorUnits(vendor.currentMinorUnits, currency), currency)}
                </Text>
                {chip ? (
                  <Text className={`mt-0.5 text-caption font-bold ${chip.className}`}>{chip.label}</Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      <AnalyticsSheetFilledCta
        label={`View transactions for ${topVendor} →`}
        onPress={() => onViewTransactions(topVendor)}
      />
    </View>
  );
}
