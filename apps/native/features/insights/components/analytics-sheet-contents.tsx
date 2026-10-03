import { Chip, PressableFeedback, SearchField } from "heroui-native";
import { useMemo, useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { AppText as Text } from "@/components/app-text";
import { TransactionRow } from "@/components/finance/transaction-row";
import { AppIcon } from "@/components/icon";
import { SelectPill } from "@/components/ui/controls";
import { Row, RowGroup } from "@/components/ui/list";
import { Money } from "@/components/ui/money";
import { tick } from "@/components/ui/motion";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { useThemeColors, withAlpha } from "@/components/ui/theme";
import { BrandLogo } from "@/features/home-preview/components/brand-logo";
import { merchantVisual } from "@/features/home-preview/data";
import type { SubscriptionSummary } from "@/lib/dashboard-data";
import { fromMinorUnits } from "@/lib/currency";

import type { AnalyticsTransactionFocus } from "../analytics-transaction-focus";
import {
  TRANSACTION_FILTER_CHIPS,
  transactionMatchesFilter,
  type TransactionFilterChip,
} from "../analytics-transaction-filters";
import type { AnalyticsDirection, AnalyticsTab } from "../analytics-scope";
import { analyticsTransactionRowKey } from "../analytics-transaction-row-key";
import type { InsightsCategorySlice, InsightsPresentation } from "../insights-presentation";
import type { InsightsTransactionRow } from "../insights-transaction-presentation";
import { CategoryChangeList, merchantLogo, rankColor, VendorRankList } from "./analytics-overview";

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
  return `Next charge · ${next.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
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
  tone = "ink",
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** The selected chip's fill: ink (dark), or lime for search filters. */
  tone?: "ink" | "accent";
}) {
  const selectedFill = tone === "accent" ? "bg-accent" : "bg-ink";
  const selectedText = tone === "accent" ? "text-on-accent" : "text-on-ink";
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
    >
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
            className={`rounded-pill px-3.5 ${selected ? selectedFill : "bg-fill"}`}
          >
            <Text
              className={`text-meta font-semibold ${selected ? selectedText : "text-ink-soft"}`}
            >
              {option.label}
            </Text>
          </Chip>
        );
      })}
    </ScrollView>
  );
}

function SheetTotal({
  label,
  value,
  currency,
  suffix,
}: {
  label: string;
  value: number;
  currency: string;
  suffix?: string;
}) {
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

/** The sheet's closing action: "View transactions for Swiggy →" on a lime wash. */
function SheetCta({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useThemeColors();
  return (
    <PressableFeedback
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="mt-4 flex-row items-center justify-center gap-1.5 rounded-pill py-3.5"
      style={{ backgroundColor: withAlpha(colors.accent, colors.isDark ? 0.18 : 0.28) }}
    >
      <Text numberOfLines={1} className="text-caption font-semibold text-ink">
        {label}
      </Text>
      <AppIcon name="chevron-right" size={14} color={colors.ink} />
    </PressableFeedback>
  );
}

/** Segments as arcs around a ring, with small gaps; the total sits inside. */
function Donut({
  segments,
  size = 136,
  stroke = 20,
  children,
}: {
  segments: readonly { key: string; value: number; color: string }[];
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const colors = useThemeColors();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  const gap = segments.length > 1 ? 3 : 0;
  let offset = 0;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.fill}
          strokeWidth={stroke}
          fill="none"
        />
        {total > 0
          ? segments.map((segment) => {
              const length = (Math.max(0, segment.value) / total) * circumference;
              const dash = Math.max(0, length - gap);
              const arc = (
                <Circle
                  key={segment.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={segment.color}
                  strokeWidth={stroke}
                  fill="none"
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
              );
              offset += length;
              return arc;
            })
          : null}
      </Svg>
      <View className="absolute inset-0 items-center justify-center">{children}</View>
    </View>
  );
}

const LEGEND_LIMIT = 5;

export function AnalyticsCategoriesSheetContent({
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
  const totalMinorUnits = presentation?.currentMonth.spendingMinorUnits ?? 0;

  if (isLoading) return <SkeletonRows count={5} />;
  if (ranked.length === 0) {
    return <EmptyState compact icon="pie-chart" title="No categorised spending yet" />;
  }

  // The ring and legend: the top five, then the rest as "Others".
  const shown = ranked.slice(0, LEGEND_LIMIT);
  const othersMinorUnits =
    totalMinorUnits - shown.reduce((sum, row) => sum + row.currentMinorUnits, 0);
  const legend = [
    // The same rank colours as the screen's ring and rows.
    ...shown.map((row, index) => ({
      key: row.category,
      label: row.category,
      value: row.currentMinorUnits,
      color: rankColor(colors, index),
    })),
    ...(othersMinorUnits > 0
      ? [{ key: "others", label: "Others", value: othersMinorUnits, color: colors.fillStrong }]
      : []),
  ];
  const share = (value: number) =>
    totalMinorUnits > 0 ? `${Math.round((value / totalMinorUnits) * 100)}%` : "—";
  const top = ranked[0]!;

  return (
    <View className="pb-4">
      <View className="flex-row items-center gap-5">
        <Donut segments={legend}>
          <Money value={categoryTotal} currency={currency} size="subtitle" />
          <Text className="text-meta text-muted">Total spend</Text>
        </Donut>
        <View className="min-w-0 flex-1 gap-2">
          {legend.map((item) => (
            <View key={item.key} className="flex-row items-center gap-2">
              <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              <Text numberOfLines={1} className="min-w-0 flex-1 text-meta text-ink-soft">
                {item.label}
              </Text>
              <Text className="text-meta font-semibold text-ink">{share(item.value)}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="mt-5">
        <CategoryChangeList
          categories={ranked}
          totalMinorUnits={totalMinorUnits}
          currency={currency}
          onOpenCategory={onViewTransactions}
        />
      </View>

      <SheetCta
        label={`View transactions for ${top.category}`}
        onPress={() => onViewTransactions(top.category)}
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
}: {
  direction: AnalyticsDirection;
  items: InsightsTransactionRow[];
  status: "loading" | "ready" | "error";
  error: string | null;
  onRetry: () => void;
  onSelect: (item: InsightsTransactionRow) => void;
  /** Initial search/filter. The parent keys this component by focus request. */
  focus: AnalyticsTransactionFocus;
}) {
  const [query, setQuery] = useState(() => focus?.searchQuery ?? "");
  const [activeFilter, setActiveFilter] = useState<TransactionFilterChip>(
    () => focus?.chip ?? "All",
  );

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
          <SearchField.Input
            placeholder="Search merchants"
            accessibilityLabel="Search transactions"
          />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>

      <View className="mt-3">
        <FilterChips
          options={TRANSACTION_FILTER_CHIPS.map((chip) => ({ value: chip, label: chip }))}
          value={activeFilter}
          onChange={setActiveFilter}
          tone="accent"
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
          title={
            filtering ? "No matches" : direction === "income" ? "No income yet" : "No spending yet"
          }
          body={filtering ? "Clear the search or pick All." : undefined}
        />
      ) : (
        groups.map((group) => (
          <View key={group.title} className="mt-5">
            <Text className="mb-2 px-1 text-caption font-semibold text-ink-soft">
              {group.title}
            </Text>
            <RowGroup animated variant="transparent" className="rounded-none">
              {group.items.map((item, index) => (
                <TransactionRow
                  key={analyticsTransactionRowKey(item, index, group.title)}
                  name={item.name}
                  subtitle={item.sub || item.category || undefined}
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
  const colors = useThemeColors();
  const [activeTier, setActiveTier] = useState<SubscriptionTier | "all">("all");
  const subscriptions = presentation.subscriptions;
  const currency = presentation.currency;
  const rows = subscriptions.top;

  const tierCounts = useMemo(() => {
    const counts = { essential: 0, likely: 0, optional: 0 };
    for (const row of rows) counts[subscriptionTier(row)] += 1;
    return counts;
  }, [rows]);

  const filtered =
    activeTier === "all" ? rows : rows.filter((row) => subscriptionTier(row) === activeTier);
  const chips: { value: SubscriptionTier | "all"; label: string }[] = [
    { value: "all", label: `All ${rows.length}` },
    { value: "essential", label: `Essential ${tierCounts.essential}` },
    { value: "likely", label: `Likely ${tierCounts.likely}` },
    { value: "optional", label: `Optional ${tierCounts.optional}` },
  ];

  const tierTotals = { essential: 0, likely: 0, optional: 0 };
  for (const row of rows) tierTotals[subscriptionTier(row)] += row.amountMinorUnits;
  const logos = rows.slice(0, 4);

  return (
    <View className="pb-4">
      <View className="flex-row items-end justify-between gap-3">
        <SheetTotal
          label={`${subscriptions.activeCount} active subscription${subscriptions.activeCount === 1 ? "" : "s"}`}
          value={fromMinorUnits(subscriptions.monthlyCommittedMinorUnits, currency)}
          currency={currency}
          suffix="/ month"
        />
        <View className="flex-row items-center gap-1.5 pb-1">
          {logos.map((row) => (
            <View key={row.id}>{merchantLogo(row.merchant, 26)}</View>
          ))}
          {rows.length > logos.length ? (
            <Text className="text-meta font-semibold text-muted">
              +{rows.length - logos.length}
            </Text>
          ) : null}
        </View>
      </View>
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
                  <View className="flex-row items-baseline">
                    <Money
                      value={fromMinorUnits(subscription.amountMinorUnits, currency)}
                      currency={currency}
                      size="body"
                    />
                    <Text className="text-meta text-muted"> / month</Text>
                  </View>
                }
                trailingSubtitle={
                  <Chip
                    size="sm"
                    variant="soft"
                    color={TIER_CHIP[tier]}
                    className="mt-1 rounded-pill px-2"
                  >
                    <Chip.Label className="text-label font-semibold">{tierLabel(tier)}</Chip.Label>
                  </Chip>
                }
              />
            );
          })}
        </RowGroup>
      )}

      {/* What each tier costs a month — the design's footer. */}
      <View
        className="mt-4 flex-row rounded-2xl px-2 py-3"
        style={{ backgroundColor: colors.fill }}
      >
        {(["essential", "likely", "optional"] as const).map((tier) => (
          <View key={tier} className="flex-1 items-center gap-1">
            <Money
              value={fromMinorUnits(tierTotals[tier], currency)}
              currency={currency}
              size="body"
            />
            <Chip size="sm" variant="soft" color={TIER_CHIP[tier]} className="rounded-pill px-2">
              <Chip.Label className="text-label font-semibold">{tierLabel(tier)}</Chip.Label>
            </Chip>
          </View>
        ))}
      </View>
    </View>
  );
}

// No range picker: merchant totals are the month so far, whatever the chart's
// range — a "6 months" pill here changed nothing and said otherwise.
export function AnalyticsVendorsSheetContent({
  currency,
  currencies,
  onCurrencyChange,
  presentation,
  onViewTransactions,
}: {
  currency: string;
  currencies: string[];
  onCurrencyChange: (currency: string) => void;
  presentation: InsightsPresentation;
  onViewTransactions: (vendor: string) => void;
}) {
  const vendors = presentation.topVendors.slice(0, 12);
  const top = vendors[0];

  return (
    <View className="pb-4">
      {currencies.length > 1 ? (
        <View className="flex-row gap-2">
          <SelectPill
            value={currency}
            options={currencies.map((code) => ({ value: code, label: code }))}
            onChange={onCurrencyChange}
            accessibilityLabel="Currency"
            tone="fill"
          />
        </View>
      ) : null}

      {vendors.length === 0 || !top ? (
        <EmptyState compact icon="bag" title="No merchants yet" />
      ) : (
        <>
          {/* Ranked: number, logo, name, amount, transactions, change. */}
          <View className="mt-3">
            <VendorRankList
              vendors={vendors}
              totalMinorUnits={presentation.currentMonth.spendingMinorUnits}
              currency={currency}
              showCount
              onOpenVendor={(vendor) => onViewTransactions(vendor.vendor)}
            />
          </View>
          <SheetCta
            label={`View transactions for ${top.vendor}`}
            onPress={() => onViewTransactions(top.vendor)}
          />
        </>
      )}
    </View>
  );
}
