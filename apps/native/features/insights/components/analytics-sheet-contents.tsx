import { Chip, SearchField } from "heroui-native";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { ShareBar } from "@/components/charts/share-bar";
import { TransactionRow } from "@/components/finance/transaction-row";
import { IconTile, SelectPill } from "@/components/ui/controls";
import { Row, RowGroup } from "@/components/ui/list";
import { Money } from "@/components/ui/money";
import { tick } from "@/components/ui/motion";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { useThemeColors, withAlpha } from "@/components/ui/theme";
import { BrandLogo } from "@/features/home-preview/components/brand-logo";
import { merchantVisual } from "@/features/home-preview/data";
import type { SubscriptionSummary } from "@/lib/dashboard-data";
import { fromMinorUnits } from "@/lib/currency";

import { INSIGHTS_TIME_SCOPES, type InsightsTimeScope } from "../analytics-scope";
import { analyticsTrendChip } from "../analytics-trend";
import type { AnalyticsTransactionFocus } from "../analytics-transaction-focus";
import {
  TRANSACTION_FILTER_CHIPS,
  transactionMatchesFilter,
  type TransactionFilterChip,
} from "../analytics-transaction-filters";
import type { AnalyticsDirection, AnalyticsTab } from "../analytics-scope";
import { analyticsTransactionRowKey } from "../analytics-transaction-row-key";
import { categoryColor, categoryIcon } from "../category-visual";
import type { InsightsCategorySlice, InsightsPresentation } from "../insights-presentation";
import type { InsightsTransactionRow } from "../insights-transaction-presentation";

// The "See all" sheets behind Analytics. Same kit as the screen: grouped
// rows, share bars, HeroUI search + chips — so opening a sheet feels like
// going deeper into the same place, not into a different app.

type SubscriptionTier = "essential" | "likely" | "optional";

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

const TIER_CHIP: Record<SubscriptionTier, "success" | "warning" | "default"> = {
  essential: "success",
  likely: "warning",
  optional: "default",
};

function formatNextCharge(lastDate: number): string {
  const next = new Date(lastDate);
  next.setMonth(next.getMonth() + 1);
  return `Next ${next.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
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

function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Chip
            key={option.value}
            size="md"
            variant={selected ? "primary" : "secondary"}
            onPress={() => {
              if (!selected) tick();
              onChange(option.value);
            }}
            accessibilityState={{ selected }}
            className={`rounded-pill px-3.5 ${selected ? "bg-ink" : "bg-fill"}`}
          >
            <Text className={`text-meta font-semibold ${selected ? "text-on-ink" : "text-ink-soft"}`}>
              {option.label}
            </Text>
          </Chip>
        );
      })}
    </ScrollView>
  );
}

function SheetTotal({ label, value, currency, suffix }: { label: string; value: number; currency: string; suffix?: string }) {
  return (
    <View>
      <Text className="text-caption font-medium text-muted">{label}</Text>
      <View className="mt-1 flex-row items-baseline">
        <Money value={value} currency={currency} size="title" />
        {suffix ? <Text className="ml-1 text-caption text-muted">{suffix}</Text> : null}
      </View>
    </View>
  );
}

export function AnalyticsCategoriesSheetContent({
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
  const colors = useThemeColors();
  const ranked = presentation?.topCategories ?? [];

  if (isLoading) return <SkeletonRows count={5} />;
  if (categories.length === 0) {
    return <EmptyState compact icon="pie-chart" title="No categorised spending yet" />;
  }

  return (
    <View className="pb-4">
      <SheetTotal label="Spent this month" value={categoryTotal} currency={currency} />
      <View className="mt-4">
        <ShareBar
          segments={categories.map((category, index) => ({
            key: category.label,
            value: category.value,
            color: categoryColor(colors.chart, index),
          }))}
        />
      </View>

      <RowGroup variant="transparent" inset={56} className="mt-3 rounded-none">
        {categories.map((category, index) => {
          const color = categoryColor(colors.chart, index);
          const chip = analyticsTrendChip(ranked.find((row) => row.category === category.label)?.changePercent ?? null);
          const share = categoryTotal > 0 ? Math.round((category.value / categoryTotal) * 100) : 0;
          return (
            <Row
              key={category.label}
              className="px-0"
              onPress={() => onViewTransactions(category.label)}
              leading={<IconTile icon={categoryIcon(category.label)} color={color} background={withAlpha(color, 0.14)} />}
              title={category.label}
              subtitle={`${share}% of spending`}
              trailing={<Money value={category.value} currency={currency} size="body" />}
              trailingSubtitle={chip ? <Text className={`mt-0.5 text-meta font-medium ${chip.className}`}>{chip.label}</Text> : undefined}
              chevron
            />
          );
        })}
      </RowGroup>
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
    const needle = query.trim().toLowerCase();
    return items.filter(
      (item) =>
        (needle.length === 0 || item.name.toLowerCase().includes(needle)) &&
        transactionMatchesFilter(item, activeFilter),
    );
  }, [activeFilter, items, query]);

  const groups = groupTransactionsByMonth(filtered);
  const filtering = query.trim().length > 0 || activeFilter !== "All";

  return (
    <View className="pb-4">
      <SearchField value={query} onChange={setQuery}>
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder="Search merchants" accessibilityLabel="Search transactions" />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>

      <View className="mt-3">
        <FilterChips
          options={TRANSACTION_FILTER_CHIPS.map((chip) => ({ value: chip, label: chip }))}
          value={activeFilter}
          onChange={setActiveFilter}
        />
      </View>

      {status === "error" ? (
        <ErrorState compact body={error} onRetry={onRetry} />
      ) : status === "loading" ? (
        <View className="mt-4">
          <SkeletonRows count={5} />
        </View>
      ) : groups.length === 0 ? (
        <EmptyState
          compact
          icon="receipt"
          title={filtering ? "No matches" : direction === "income" ? "No income yet" : "No spending yet"}
          body={filtering ? "Clear the search or pick All." : undefined}
        />
      ) : (
        groups.map((group) => (
          <View key={group.title} className="mt-5">
            <Text className="mb-2 px-1 text-caption font-semibold text-ink-soft">{group.title}</Text>
            <RowGroup animated variant="transparent" className="rounded-none">
              {group.items.map((item, index) => (
                <TransactionRow
                  key={analyticsTransactionRowKey(item, index, group.title)}
                  name={item.name}
                  subtitle={item.category || undefined}
                  meta={new Date(item.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  logo={item}
                  amount={item.amountValue}
                  amountLabel={item.amount}
                  currency={item.currency}
                  direction={item.direction ?? direction}
                  onPress={() => onSelect(item)}
                />
              ))}
            </RowGroup>
          </View>
        ))
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
    for (const row of rows) counts[subscriptionTier(row)] += 1;
    return counts;
  }, [rows]);

  const filtered = activeTier === "all" ? rows : rows.filter((row) => subscriptionTier(row) === activeTier);
  const chips: { value: SubscriptionTier | "all"; label: string }[] = [
    { value: "all", label: `All ${rows.length}` },
    { value: "essential", label: `Essential ${tierCounts.essential}` },
    { value: "likely", label: `Likely ${tierCounts.likely}` },
    { value: "optional", label: `Optional ${tierCounts.optional}` },
  ];

  return (
    <View className="pb-4">
      <SheetTotal
        label={`${subscriptions.activeCount} active subscription${subscriptions.activeCount === 1 ? "" : "s"}`}
        value={fromMinorUnits(subscriptions.monthlyCommittedMinorUnits, currency)}
        currency={currency}
        suffix="/ month"
      />
      <View className="mt-4">
        <FilterChips options={chips} value={activeTier} onChange={setActiveTier} />
      </View>

      {filtered.length === 0 ? (
        <EmptyState compact icon="repeat" title="Nothing in this group" />
      ) : (
        <RowGroup variant="transparent" className="mt-3 rounded-none">
          {filtered.map((subscription) => {
            const visual = merchantVisual(subscription.merchant);
            const tier = subscriptionTier(subscription);
            return (
              <Row
                key={subscription.id}
                className="px-0"
                leading={
                  <BrandLogo
                    letter={subscription.merchant.charAt(0).toUpperCase()}
                    tile={visual.tile}
                    ink={visual.ink}
                    img={visual.img ?? undefined}
                    size={40}
                    radius={20}
                    iconRatio={0.6}
                  />
                }
                title={subscription.merchant}
                subtitle={formatNextCharge(subscription.lastDate)}
                trailing={
                  <Money value={fromMinorUnits(subscription.amountMinorUnits, currency)} currency={currency} size="body" />
                }
                trailingSubtitle={
                  <Chip size="sm" variant="soft" color={TIER_CHIP[tier]} className="mt-1 rounded-pill px-2">
                    <Chip.Label className="text-label font-semibold">{tierLabel(tier)}</Chip.Label>
                  </Chip>
                }
              />
            );
          })}
        </RowGroup>
      )}
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
  const vendors = presentation.topVendors.slice(0, 12);

  return (
    <View className="pb-4">
      <View className="flex-row gap-2">
        <SelectPill
          value={scope}
          options={INSIGHTS_TIME_SCOPES.map((item) => ({ value: item.value, label: item.label }))}
          onChange={(next) => onScopeChange(next as InsightsTimeScope)}
          icon="calendar"
          accessibilityLabel="Time range"
          tone="fill"
        />
        {currencies.length > 1 ? (
          <SelectPill
            value={currency}
            options={currencies.map((code) => ({ value: code, label: code }))}
            onChange={onCurrencyChange}
            accessibilityLabel="Currency"
            tone="fill"
          />
        ) : null}
      </View>

      {vendors.length === 0 ? (
        <EmptyState compact icon="bag" title="No merchants yet" />
      ) : (
        <RowGroup variant="transparent" className="mt-3 rounded-none">
          {vendors.map((vendor, index) => {
            const visual = merchantVisual(vendor.vendor);
            const chip = analyticsTrendChip(vendor.changePercent);
            return (
              <Row
                key={`${vendor.vendor}:${index}`}
                className="px-0"
                onPress={() => onViewTransactions(vendor.vendor)}
                leading={
                  <BrandLogo
                    letter={vendor.vendor.charAt(0).toUpperCase()}
                    tile={visual.tile}
                    ink={visual.ink}
                    img={visual.img ?? undefined}
                    size={40}
                    radius={20}
                    iconRatio={0.6}
                  />
                }
                title={vendor.vendor}
                subtitle={`${vendor.transactionCount} payment${vendor.transactionCount === 1 ? "" : "s"}`}
                trailing={<Money value={fromMinorUnits(vendor.currentMinorUnits, currency)} currency={currency} size="body" />}
                trailingSubtitle={chip ? <Text className={`mt-0.5 text-meta font-medium ${chip.className}`}>{chip.label}</Text> : undefined}
                chevron
              />
            );
          })}
        </RowGroup>
      )}
    </View>
  );
}
