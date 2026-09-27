import { memo, useCallback, useMemo, useRef } from "react";
import { Pressable, SectionList, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { ShareBar } from "@/components/charts/share-bar";
import { TransactionRow } from "@/components/finance/transaction-row";
import { useFloatingTabBarClearance } from "@/components/floating-tab-bar";
import { AppIcon } from "@/components/icon";
import { Segmented, SelectPill } from "@/components/ui/controls";
import { LargeTitle } from "@/components/ui/header";
import { Money } from "@/components/ui/money";
import { tick } from "@/components/ui/motion";
import { EmptyState, SkeletonRows } from "@/components/ui/states";
import { useThemeColors } from "@/components/ui/theme";
import { fromMinorUnits } from "@/lib/currency";
import { useActivityFiltersStore, type ActivityDirectionFilter } from "@/stores/activity-filters-store";

import type { HomeAccount, HomeActivityViewItem } from "../data";
import { ACTIVITY_COPY, ACTIVITY_DIRECTION_FILTERS } from "./activity-list.content";

// Transactions: title + account → month → filter → a quiet month summary →
// days as grouped cards. One row design (components/finance/transaction-row)
// shared with Home and Analytics.

function isTransfer(item: HomeActivityViewItem): boolean {
  return item.pills.some((pill) => pill.key === "type" && /transfer/i.test(pill.label));
}

function matchesFilter(item: HomeActivityViewItem, filter: ActivityDirectionFilter): boolean {
  if (filter === "all") return true;
  if (filter === "transfer") return isTransfer(item);
  return item.direction === filter;
}

type ActivityAccount = Pick<HomeAccount, "key" | "bankName" | "bankIcon" | "last4"> & {
  status?: string;
};

const EMPTY_ACTIVITY_ACCOUNTS: ActivityAccount[] = [];

function accountLabel(account: ActivityAccount): string {
  const last4 = account.last4?.replace(/\D/g, "").slice(-4) ?? "";
  return last4 ? `${account.bankName} ·· ${last4}` : account.bankName;
}

function categoryLabel(item: HomeActivityViewItem): string {
  return (
    item.categorySuggestions[0]?.label ??
    item.pills.find((pill) => pill.key === "category")?.label ??
    ACTIVITY_COPY.otherCategoryLabel
  );
}

function dayKey(timestampMs: number): string {
  const date = new Date(timestampMs);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

// Built once: every Date#toLocale*String call constructs a fresh Intl
// formatter, which is slow on Hermes — and these run for every row.
const DAY_TITLE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const TIME_FORMAT = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });
const MONTH_YEAR_FORMAT = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" });
const MONTH_FORMAT = new Intl.DateTimeFormat("en-IN", { month: "long" });

function dayTitle(timestampMs: number): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(timestampMs) === dayKey(today.getTime())) return "Today";
  if (dayKey(timestampMs) === dayKey(yesterday.getTime())) return "Yesterday";
  return DAY_TITLE_FORMAT.format(timestampMs);
}

function timeLabel(timestampMs: number): string {
  return TIME_FORMAT.format(timestampMs);
}

function amountOf(item: HomeActivityViewItem): number | null {
  if (item.amountMinorUnits === null || !item.currency) return null;
  return fromMinorUnits(item.amountMinorUnits, item.currency);
}

type DaySection = {
  // SectionList keys cells by section key + item key. Without a stable
  // section key it falls back to the section INDEX, so a filter that removes
  // one day would re-key (remount) every row after it.
  key: string;
  dayKey: string;
  title: string;
  spent: number;
  currency: string;
  data: HomeActivityViewItem[];
};

function groupByDay(items: HomeActivityViewItem[]): DaySection[] {
  const groups = new Map<string, DaySection & { timestamp: number }>();
  for (const item of items) {
    const key = dayKey(item.date);
    let group = groups.get(key);
    if (!group) {
      group = { key, dayKey: key, title: dayTitle(item.date), spent: 0, currency: item.currency ?? "INR", data: [], timestamp: item.date };
      groups.set(key, group);
    }
    group.data.push(item);
    if (item.direction === "expense" && !isTransfer(item)) group.spent += amountOf(item) ?? 0;
  }
  return [...groups.values()].sort((left, right) => right.timestamp - left.timestamp);
}

function monthLabel(timestampMs: number): string {
  return MONTH_YEAR_FORMAT.format(timestampMs);
}

// One list cell. Memoized with stable props, so a parent re-render (a store
// change, a live data refresh) doesn't re-render every mounted row. No
// entering/layout animation: on a virtualized list those replay for every
// cell mounted during a scroll and animate every cell on any height change.
const ActivityRowCell = memo(function ActivityRowCell({
  item,
  first,
  last,
  onSelect,
}: {
  item: HomeActivityViewItem;
  first: boolean;
  last: boolean;
  onSelect?: (item: HomeActivityViewItem) => void;
}) {
  const onPress = useCallback(() => onSelect?.(item), [onSelect, item]);
  return (
    <View
      className={`overflow-hidden bg-card ${first ? "rounded-t-card" : ""} ${last ? "rounded-b-card" : ""}`}
    >
      {!first ? <View className="ml-[68px] h-px bg-divider" /> : null}
      <TransactionRow
        name={item.name}
        subtitle={categoryLabel(item)}
        meta={timeLabel(item.date)}
        logo={item}
        amount={amountOf(item)}
        amountLabel={item.amount}
        currency={item.currency}
        direction={isTransfer(item) ? "neutral" : item.direction}
        onPress={onSelect ? onPress : undefined}
      />
    </View>
  );
});

const keyExtractor = (item: HomeActivityViewItem) => item.key;

function DaySectionHeader({ section }: { section: DaySection }) {
  return (
    <View className="flex-row items-baseline justify-between px-1 pb-2 pt-6">
      <Text className="text-caption font-semibold text-ink-soft">{section.title}</Text>
      {section.spent > 0 ? (
        <Money value={section.spent} currency={section.currency} size="caption" tone="muted" />
      ) : null}
    </View>
  );
}

const renderSectionHeader = ({ section }: { section: DaySection }) => (
  <DaySectionHeader section={section} />
);

function MonthSwitcher({
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
  const colors = useThemeColors();
  return (
    <View className="mt-4 flex-row items-center justify-between">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous month"
        onPress={() => {
          tick();
          onPrev();
        }}
        hitSlop={10}
        className="h-9 w-9 items-center justify-center rounded-full bg-card"
      >
        <AppIcon name="chevron-left" size={16} color={colors.ink} />
      </Pressable>
      <Text className="text-body font-semibold text-ink">{monthLabel(monthStart)}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next month"
        onPress={() => {
          tick();
          onNext();
        }}
        disabled={!canGoNext}
        hitSlop={10}
        className={`h-9 w-9 items-center justify-center rounded-full bg-card ${canGoNext ? "" : "opacity-35"}`}
      >
        <AppIcon name="chevron-right" size={16} color={colors.ink} />
      </Pressable>
    </View>
  );
}

function MonthSummary({ items, monthStart }: { items: HomeActivityViewItem[]; monthStart: number }) {
  const colors = useThemeColors();
  const summary = useMemo(() => {
    let spent = 0;
    let earned = 0;
    let currency = "INR";
    const byCategory = new Map<string, number>();
    for (const item of items) {
      const value = amountOf(item);
      if (value === null || isTransfer(item)) continue;
      currency = item.currency ?? currency;
      if (item.direction === "income") earned += value;
      if (item.direction === "expense") {
        spent += value;
        const label = categoryLabel(item);
        byCategory.set(label, (byCategory.get(label) ?? 0) + value);
      }
    }
    const categories = [...byCategory.entries()].sort(([, a], [, b]) => b - a).slice(0, 5);
    return { spent, earned, currency, categories };
  }, [items]);

  if (summary.spent === 0 && summary.earned === 0) return null;
  const month = MONTH_FORMAT.format(monthStart);

  return (
    <View className="mt-4 rounded-card bg-card p-5">
      <View className="flex-row items-end justify-between">
        <View>
          <Text className="text-caption font-medium text-muted">Spent in {month}</Text>
          <Money value={summary.spent} currency={summary.currency} size="title" animated className="mt-1" />
        </View>
        {summary.earned > 0 ? (
          <View className="items-end">
            <Text className="text-caption font-medium text-muted">Money in</Text>
            <Money value={summary.earned} currency={summary.currency} size="subtitle" tone="income" sign="income" className="mt-1" />
          </View>
        ) : null}
      </View>
      {summary.categories.length > 0 ? (
        <>
          <View className="mt-4">
            <ShareBar
              height={8}
              segments={summary.categories.map(([label, value], index) => ({
                key: label,
                value,
                color: colors.chart[index % colors.chart.length]!,
              }))}
            />
          </View>
          <View className="mt-3 flex-row flex-wrap gap-x-4 gap-y-1.5">
            {summary.categories.map(([label], index) => (
              <View key={label} className="flex-row items-center gap-1.5">
                <View className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.chart[index % colors.chart.length] }} />
                <Text className="text-meta text-muted">{label}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </View>
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
  loading = false,
}: {
  activity: ActivityListData;
  accounts?: ActivityAccount[];
  selectedAccountKey: string;
  onAccountKeyChange: (key: string) => void;
  onSelect?: (item: HomeActivityViewItem) => void;
  topInset: number;
  /** A new month/account is loading: show row skeletons, not "no transactions". */
  loading?: boolean;
}) {
  const tabBarClearance = useFloatingTabBarClearance();
  const filter = useActivityFiltersStore((state) => state.direction);
  const setFilter = useActivityFiltersStore((state) => state.setDirection);
  const monthStart = useActivityFiltersStore((state) => state.monthStart);
  const goPrevMonth = useActivityFiltersStore((state) => state.goPrevMonth);
  const goNextMonth = useActivityFiltersStore((state) => state.goNextMonth);
  const scrollToDay = useActivityFiltersStore((state) => state.scrollToDay);
  const clearScrollToDay = useActivityFiltersStore((state) => state.clearScrollToDay);
  const listRef = useRef<SectionList<HomeActivityViewItem, DaySection>>(null);
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
      listRef.current?.scrollToLocation({ sectionIndex, itemIndex: 0, viewPosition: 0, animated: true });
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
    listRef.current?.scrollToLocation({ sectionIndex: 0, itemIndex: 0, viewOffset: 0, animated: false });
    requestAnimationFrame(() => {
      if (!scrollToSection(target)) {
        retryTargetDay.current = null;
        scrollRetryCount.current = 0;
      }
    });
  }, [scrollToSection]);

  const accountOptions = useMemo(
    () => [
      { value: "all", label: "All accounts" },
      ...bankAccounts.map((account) => ({ value: account.key, label: accountLabel(account) })),
    ],
    [bankAccounts],
  );

  const renderItem = useCallback(
    ({ item, index, section }: { item: HomeActivityViewItem; index: number; section: DaySection }) => (
      <ActivityRowCell
        item={item}
        first={index === 0}
        last={index === section.data.length - 1}
        onSelect={onSelect}
      />
    ),
    [onSelect],
  );

  const header = (
    <View>
      <LargeTitle
        title={ACTIVITY_COPY.title}
        topInset={topInset}
        right={
          bankAccounts.length > 0 ? (
            <SelectPill
              value={selectedAccountKey}
              options={accountOptions}
              onChange={onAccountKeyChange}
              icon="card"
              accessibilityLabel="Choose account"
            />
          ) : undefined
        }
      />
      <MonthSwitcher
        monthStart={monthStart}
        onPrev={goPrevMonth}
        onNext={goNextMonth}
        canGoNext={monthStart < currentMonthStart}
      />
      <Segmented
        value={filter}
        options={ACTIVITY_DIRECTION_FILTERS}
        onChange={setFilter}
        size="sm"
        className="mt-4"
      />
      {filter === "all" || filter === "expense" ? (
        <MonthSummary items={inMonthItems} monthStart={monthStart} />
      ) : null}
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <SectionList
        ref={listRef}
        sections={sections}
        keyExtractor={keyExtractor}
        stickySectionHeadersEnabled={false}
        onContentSizeChange={scrollToDaySection}
        onScrollToIndexFailed={onScrollToIndexFailed}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? (
            <View className="mt-6">
              <SkeletonRows count={5} />
            </View>
          ) : (
            <View className="mt-4 rounded-card bg-card">
              <EmptyState
                icon="rupee-receipt"
                title={inMonthItems.length > 0 ? ACTIVITY_COPY.emptyFilteredTitle : ACTIVITY_COPY.emptyTitle}
                body={inMonthItems.length > 0 ? undefined : ACTIVITY_COPY.emptyBody}
              />
            </View>
          )
        }
        renderSectionHeader={renderSectionHeader}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: tabBarClearance }}
        showsVerticalScrollIndicator={false}
        // Rows are a fixed ~60pt: render what fills the screen, keep a small
        // window, and let Android drop offscreen views from the hierarchy.
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
      />
    </View>
  );
}
