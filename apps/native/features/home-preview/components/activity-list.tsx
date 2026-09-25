import { Select, Tabs } from "heroui-native";
import { useCallback, useMemo, useRef } from "react";
import { Pressable, SectionList, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";
import { useFloatingTabBarClearance } from "@/components/floating-tab-bar";
import { formatMoney } from "@/features/dashboard/utils/format";
import { fromMinorUnits } from "@/lib/currency";
import { useActivityFiltersStore, type ActivityDirectionFilter } from "@/stores/activity-filters-store";

import type { HomeAccount, HomeActivityViewItem } from "../data";
import { ACTIVITY_COPY, ACTIVITY_DIRECTION_FILTERS } from "./activity-list.content";
import { ActivityTagRow } from "./activity-tags";
import { BrandLogo } from "./brand-logo";
import { EmptyNote } from "./empty-note";

const CATEGORY_SLICE_COLORS = [
  "bg-category-1",
  "bg-category-2",
  "bg-category-3",
  "bg-category-4",
  "bg-category-5",
  "bg-category-6",
] as const;

function matchesFilter(item: HomeActivityViewItem, filter: ActivityDirectionFilter): boolean {
  if (filter === "all") return true;
  if (filter === "transfer") return item.pills.some((pill) => pill.key === "type" && /transfer/i.test(pill.label));
  return item.direction === filter;
}

type ActivityAccount = Pick<HomeAccount, "key" | "bankName" | "bankIcon" | "last4"> & {
  status?: string;
};

type AccountSelectOption = {
  value: string;
  label: string;
};

const EMPTY_ACTIVITY_ACCOUNTS: ActivityAccount[] = [];

function trailingDigits(value: string | null | undefined): string {
  return value?.replace(/\D/g, "").slice(-4) ?? "";
}

function accountLabel(account: ActivityAccount): string {
  const last4 = trailingDigits(account.last4);
  return last4 ? `${account.bankName} · •••• ${last4}` : account.bankName;
}

function BankAccountPicker({
  accounts,
  selectedKey,
  onChange,
}: {
  accounts: ActivityAccount[];
  selectedKey: string;
  onChange: (key: string) => void;
}) {
  const options = useMemo<AccountSelectOption[]>(
    () => [
      { value: "all", label: "All accounts" },
      ...accounts.map((account) => ({ value: account.key, label: accountLabel(account) })),
    ],
    [accounts],
  );
  const selectedOption = options.find((option) => option.value === selectedKey) ?? options[0]!;

  return (
    <Select
      value={selectedOption}
      onValueChange={(next) => {
        if (!Array.isArray(next)) onChange(next?.value ?? "all");
      }}
      presentation="popover"
    >
      <Select.Trigger
        variant="unstyled"
        accessibilityRole="button"
        accessibilityLabel="Choose bank account for transactions"
        className="max-w-full min-h-[38px] flex-row items-center gap-[7px] self-center rounded-pill bg-ink-deep px-[13px]"
      >
        <AppIcon name="card" size={15} color="#ffffff" />
        <Select.Value
          placeholder="Choose account"
          numberOfLines={1}
          className="max-w-[250px] text-meta font-extrabold text-on-ink"
        />
        <Select.TriggerIndicator iconProps={{ color: "#ffffff", size: 14 }} />
      </Select.Trigger>
      <Select.Portal>
        <Select.Overlay />
        <Select.Content presentation="popover" className="min-w-[240px] max-w-[320px]">
          {options.map((option) => (
            <Select.Item key={option.value} value={option.value} label={option.label}>
              <Select.ItemLabel numberOfLines={1} className="min-w-0 flex-1" />
              <Select.ItemIndicator />
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Portal>
    </Select>
  );
}

function spendCategoryLabel(item: HomeActivityViewItem): string {
  const suggested = item.categorySuggestions[0]?.label;
  if (suggested) return suggested;
  const bank = item.pills.find((pill) => pill.key === "bank")?.label;
  if (bank) return bank;
  return ACTIVITY_COPY.otherCategoryLabel;
}

function directionLabel(direction: HomeActivityViewItem["direction"]): string {
  if (direction === "income") return ACTIVITY_COPY.directionLabel.income;
  if (direction === "expense") return ACTIVITY_COPY.directionLabel.expense;
  return ACTIVITY_COPY.directionLabel.transfer;
}

function dayKey(timestampMs: number): string {
  const date = new Date(timestampMs);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayHeading(timestampMs: number): { top: string; bottom: string } {
  const date = new Date(timestampMs);
  return {
    top: String(date.getDate()),
    bottom: `${date.toLocaleDateString("en-IN", { weekday: "short" })}  ${String(
      date.getMonth() + 1,
    ).padStart(2, "0")}.${date.getFullYear()}`,
  };
}

function monthLabel(timestampMs: number): string {
  return new Date(timestampMs).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function DateNav({
  monthStart,
  onPrev,
  onNext,
  canGoNext,
}: {
  monthStart: number;
  onPrev: () => void;
  onNext: () => void;
  canGoNext: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between px-5 pt-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous month"
        onPress={onPrev}
        hitSlop={10}
        className="h-8 w-8 items-center justify-center rounded-full bg-surface-muted"
      >
        <AppIcon name="chevron-left" size={16} color="#101014" />
      </Pressable>
      <Text className="text-subtitle font-extrabold text-ink">{monthLabel(monthStart)}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next month"
        onPress={onNext}
        disabled={!canGoNext}
        hitSlop={10}
        className={`h-8 w-8 items-center justify-center rounded-full bg-surface-muted ${canGoNext ? "" : "opacity-40"}`}
      >
        <AppIcon name="chevron-right" size={16} color="#101014" />
      </Pressable>
    </View>
  );
}

function groupByDay(items: HomeActivityViewItem[]) {
  const groups = new Map<string, { timestamp: number; items: HomeActivityViewItem[] }>();
  for (const item of items) {
    const timestamp = item.date;
    const key = dayKey(timestamp);
    const existing = groups.get(key);
    if (existing) existing.items.push(item);
    else groups.set(key, { timestamp, items: [item] });
  }
  return [...groups.values()]
    .sort((left, right) => right.timestamp - left.timestamp)
    .map((group) => ({ dayKey: dayKey(group.timestamp), title: dayHeading(group.timestamp), data: group.items }));
}

function primaryExpenseCurrency(items: HomeActivityViewItem[]): string {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.direction !== "expense") continue;
    const currency = item.currency ?? "INR";
    counts.set(currency, (counts.get(currency) ?? 0) + 1);
  }
  if (counts.has("INR")) return "INR";
  return [...counts.entries()].sort(([, left], [, right]) => right - left)[0]?.[0] ?? "INR";
}

function categoryBreakdown(items: HomeActivityViewItem[]) {
  const currency = primaryExpenseCurrency(items);
  const totals = new Map<string, number>();
  for (const item of items) {
    if (item.direction !== "expense") continue;
    if ((item.currency ?? "INR") !== currency) continue;
    if (item.amountMinorUnits === null) continue;
    const value = fromMinorUnits(item.amountMinorUnits, currency);
    const label = spendCategoryLabel(item);
    totals.set(label, (totals.get(label) ?? 0) + value);
  }
  const sorted = [...totals.entries()].sort(([, left], [, right]) => right - left);
  const total = sorted.reduce((sum, [, value]) => sum + value, 0);
  const fallbackColor = CATEGORY_SLICE_COLORS[CATEGORY_SLICE_COLORS.length - 1];
  return {
    total,
    currency,
    slices: sorted.slice(0, 5).map(([label, value], index) => ({
      label,
      value,
      colorClass: CATEGORY_SLICE_COLORS[index] ?? fallbackColor,
      pct: total === 0 ? 0 : (value / total) * 100,
    })),
  };
}

function DirectionSegmentedControl({
  filter,
  onChange,
}: {
  filter: ActivityDirectionFilter;
  onChange: (filter: ActivityDirectionFilter) => void;
}) {
  return (
    <Tabs value={filter} onValueChange={(value) => onChange(value as ActivityDirectionFilter)}>
      <Tabs.List className="self-center">
        <Tabs.Indicator />
        {ACTIVITY_DIRECTION_FILTERS.map((option) => (
          <Tabs.Trigger key={option.value} value={option.value}>
            <Tabs.Label numberOfLines={1}>{option.label}</Tabs.Label>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs>
  );
}

function SpendSummary({ items }: { items: HomeActivityViewItem[] }) {
  const { total, currency, slices } = useMemo(() => categoryBreakdown(items), [items]);
  if (slices.length === 0) return null;

  return (
    <View className="px-5 pb-4 pt-5">
      <View className="flex-row items-center justify-between">
        <Text className="text-body font-bold text-ink">{ACTIVITY_COPY.totalSpendLabel}</Text>
        <Text className="text-subtitle font-extrabold text-ink">{formatMoney(total, currency)}</Text>
      </View>

      <View className="mt-3.5 h-[26px] flex-row gap-1.5">
        {slices.map((slice) => (
          <View
            key={slice.label}
            className={`rounded-lg ${slice.colorClass}`}
            style={{ flex: Math.max(slice.pct, 4) }}
          />
        ))}
      </View>

      <View className="mt-3.5 flex-row flex-wrap gap-x-5 gap-y-2">
        {slices.map((slice) => (
          <View key={slice.label} className="flex-row items-center gap-1.5">
            <View className={`h-[7px] w-[7px] rounded-full ${slice.colorClass}`} />
            <Text className="text-caption text-muted">{slice.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function RowTags({ item }: { item: HomeActivityViewItem }) {
  const tags = [
    ...item.pills
      .filter((pill) => pill.key !== "type")
      .map((pill) => ({ key: pill.key, label: pill.label, tone: pill.tone })),
    ...item.categorySuggestions.map((suggestion) => ({
      key: suggestion.key,
      label: suggestion.label,
      tone: "subcategory" as const,
    })),
  ];

  return <ActivityTagRow tags={tags} />;
}

function TransactionRow({
  item,
  onPress,
}: {
  item: HomeActivityViewItem;
  onPress?: (item: HomeActivityViewItem) => void;
}) {
  const typeLabel = item.pills.find((pill) => pill.key === "type")?.label;
  const isIncome = item.direction === "income";

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? `View details for ${item.name}` : undefined}
      onPress={onPress ? () => onPress(item) : undefined}
      className="flex-row items-start gap-3 py-3"
    >
      <BrandLogo
        letter={item.letter}
        tile={item.tile}
        ink={item.ink}
        img={item.img}
        size={40}
        radius={20}
        iconRatio={0.62}
      />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-subtitle font-bold text-ink">
          {item.name}
        </Text>
        <Text numberOfLines={1} className="mt-0.5 text-caption text-muted">
          {typeLabel ? `${typeLabel} · ${item.sub}` : item.sub}
        </Text>
        <RowTags item={item} />
      </View>
      {item.amount && (
        <View className="items-end">
          <Text
            className={`text-body font-extrabold ${isIncome ? "text-positive" : "text-negative"}`}
          >
            {item.amount}
          </Text>
          <Text className="mt-0.5 text-meta text-muted">{directionLabel(item.direction)}</Text>
        </View>
      )}
    </Pressable>
  );
}

type ActivityListData = {
  dateLabel: string;
  filters: { value: string; label: string; count: number }[];
  items: HomeActivityViewItem[];
  allItems: HomeActivityViewItem[];
};

export function ActivityList({
  activity,
  accounts,
  selectedAccountKey,
  onAccountKeyChange,
  onSelect,
  topInset,
}: {
  activity: ActivityListData;
  accounts?: ActivityAccount[];
  selectedAccountKey: string;
  onAccountKeyChange: (key: string) => void;
  onSelect?: (item: HomeActivityViewItem) => void;
  topInset: number;
}) {
  const tabBarClearance = useFloatingTabBarClearance();
  const filter = useActivityFiltersStore((state) => state.direction);
  const setFilter = useActivityFiltersStore((state) => state.setDirection);
  const monthStart = useActivityFiltersStore((state) => state.monthStart);
  const goPrevMonth = useActivityFiltersStore((state) => state.goPrevMonth);
  const goNextMonth = useActivityFiltersStore((state) => state.goNextMonth);
  const scrollToDay = useActivityFiltersStore((state) => state.scrollToDay);
  const clearScrollToDay = useActivityFiltersStore((state) => state.clearScrollToDay);
  const listRef = useRef<SectionList<HomeActivityViewItem>>(null);
  const bankAccounts = accounts ?? EMPTY_ACTIVITY_ACCOUNTS;

  const transactional = useMemo(
    () => activity.allItems.filter((item) => item.amount !== null),
    [activity.allItems],
  );
  const currentMonthStart = useMemo(() => {
    const now = new Date();
    now.setDate(1);
    now.setHours(0, 0, 0, 0);
    return now.getTime();
  }, []);
  const monthEnd = useMemo(() => {
    const date = new Date(monthStart);
    date.setMonth(date.getMonth() + 1);
    return date.getTime();
  }, [monthStart]);

  const inMonthItems = useMemo(
    () => transactional.filter((item) => item.date >= monthStart && item.date < monthEnd),
    [transactional, monthStart, monthEnd],
  );
  const visibleItems = useMemo(
    () => inMonthItems.filter((item) => matchesFilter(item, filter)),
    [inMonthItems, filter],
  );
  const sections = useMemo(() => groupByDay(visibleItems), [visibleItems]);

  const scrollRetryCount = useRef(0);
  const retryTargetDay = useRef<number | null>(null);
  const scrollToSection = useCallback(
    (targetDay: number) => {
      const targetKey = dayKey(targetDay);
      const sectionIndex = sections.findIndex((section) => section.dayKey === targetKey);
      if (sectionIndex === -1) return false;
      listRef.current?.scrollToLocation({
        sectionIndex,
        itemIndex: 0,
        viewPosition: 0,
        animated: true,
      });
      return true;
    },
    [sections],
  );
  const scrollToDaySection = useCallback(() => {
    if (scrollToDay === null) return;
    scrollRetryCount.current = 0;
    retryTargetDay.current = scrollToDay;
    scrollToSection(scrollToDay);
    clearScrollToDay();
  }, [scrollToDay, scrollToSection, clearScrollToDay]);

  const onScrollToIndexFailed = useCallback(() => {
    const target = retryTargetDay.current;
    if (target === null || scrollRetryCount.current >= 3) {
      retryTargetDay.current = null;
      scrollRetryCount.current = 0;
      return;
    }
    scrollRetryCount.current += 1;
    listRef.current?.scrollToLocation({
      sectionIndex: 0,
      itemIndex: 0,
      viewOffset: 0,
      animated: false,
    });
    requestAnimationFrame(() => {
      if (!scrollToSection(target)) {
        retryTargetDay.current = null;
        scrollRetryCount.current = 0;
      }
    });
  }, [scrollToSection]);

  return (
    <View className="flex-1 bg-card" style={{ paddingTop: Math.max(12, topInset) }}>
      <DateNav
        monthStart={monthStart}
        onPrev={goPrevMonth}
        onNext={goNextMonth}
        canGoNext={monthStart < currentMonthStart}
      />
      {bankAccounts.length > 0 && (
        <View className="px-5 pt-3">
          <BankAccountPicker
            accounts={bankAccounts}
            selectedKey={selectedAccountKey}
            onChange={onAccountKeyChange}
          />
        </View>
      )}
      <View className="mt-4 px-5 pt-2">
        <DirectionSegmentedControl filter={filter} onChange={setFilter} />
      </View>

      <SectionList
        ref={listRef}
        sections={sections}
        keyExtractor={(item) => item.key}
        stickySectionHeadersEnabled={false}
        onContentSizeChange={scrollToDaySection}
        onScrollToIndexFailed={onScrollToIndexFailed}
        ListHeaderComponent={<SpendSummary items={visibleItems} />}
        ListEmptyComponent={
          <EmptyNote
            icon="rupee-receipt"
            title={ACTIVITY_COPY.emptyTitle}
            body={ACTIVITY_COPY.emptyBody}
          />
        }
        renderSectionHeader={({ section }) => (
          <View className="flex-row items-baseline gap-2 bg-card px-5 pb-1.5 pt-[18px]">
            <Text className="text-body font-extrabold text-ink">{section.title.top}</Text>
            <Text className="text-meta font-semibold text-muted">{section.title.bottom}</Text>
          </View>
        )}
        renderItem={({ item, index }) => (
          <View className={`px-5 ${index === 0 ? "" : "border-t border-divider"}`}>
            <TransactionRow item={item} onPress={onSelect} />
          </View>
        )}
        contentContainerStyle={{ paddingBottom: tabBarClearance }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
