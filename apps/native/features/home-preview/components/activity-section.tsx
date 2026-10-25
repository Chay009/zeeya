import { Chip } from "heroui-native";
import { useState } from "react";
import { ScrollView, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { TransactionRow } from "@/components/finance/transaction-row";
import { RowGroup } from "@/components/ui/list";
import { tick } from "@/components/ui/motion";
import { Section } from "@/components/ui/section";
import { EmptyReceipt } from "@/components/art/state-marks";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";

import type { ActivityCategoryFilter } from "@/lib/activity-filters";
import type { ActivityRowPresentation } from "../data";

// Recent activity on Home: a heading with "See all", category chips, then
// the latest five in the shared row style.

export interface ActivitySectionData<Item extends ActivityRowPresentation> {
  dateLabel: string;
  filters: { value: ActivityCategoryFilter; label: string; count: number }[];
  items: Item[];
  allItems: Item[];
}

export function ActivityFilterPills({
  filters,
  onSelect,
  selectedFilter,
}: {
  filters: { value: ActivityCategoryFilter; label: string; count: number }[];
  onSelect: (filter: ActivityCategoryFilter) => void;
  selectedFilter: ActivityCategoryFilter;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="-mx-4"
      contentContainerStyle={{ gap: 8, paddingBottom: 12, paddingHorizontal: 16 }}
    >
      {filters.map((filter) => {
        const selected = selectedFilter === filter.value;
        return (
          <Chip
            key={filter.value}
            size="md"
            variant={selected ? "primary" : "secondary"}
            color="default"
            onPress={() => {
              if (!selected) tick();
              onSelect(filter.value);
            }}
            accessibilityState={{ selected }}
            className={`rounded-pill px-3.5 ${selected ? "bg-ink" : "bg-card"}`}
          >
            <Text className={`text-meta font-semibold ${selected ? "text-on-ink" : "text-ink-soft"}`}>
              {filter.label}
            </Text>
            <Text className={`text-meta ${selected ? "text-on-ink opacity-60" : "text-faint"}`}>
              {filter.count}
            </Text>
          </Chip>
        );
      })}
    </ScrollView>
  );
}

/** One activity row — the shared transaction row fed from an activity item. */
export function ActivityItemRow<Item extends ActivityRowPresentation>({
  item,
  onPress,
}: {
  item: Item;
  index?: number;
  onPress?: (item: Item) => void;
}) {
  const category = item.categorySuggestions[0]?.label;
  return (
    <TransactionRow
      name={item.name}
      subtitle={category ?? item.sub}
      meta={category ? item.sub.split(" · ")[0] : undefined}
      logo={item}
      amountLabel={item.amount}
      direction={item.direction === "income" ? "income" : item.direction === "expense" ? "expense" : "neutral"}
      onPress={onPress ? () => onPress(item) : undefined}
    />
  );
}

export function ActivitySection<Item extends ActivityRowPresentation>({
  activity,
  onSeeAll,
  onSelect,
  onFilterChange,
  selectedFilter: selectedFilterProp,
  activityStatus = "ready",
  activityError = null,
  onRetry,
}: {
  activity: ActivitySectionData<Item>;
  onSeeAll?: () => void;
  onSelect?: (item: Item) => void;
  selectedFilter?: ActivityCategoryFilter;
  // When provided, filtering is server-driven: the parent already fetched a
  // filter-scoped slice as activity.items, so render it directly instead of
  // filtering allItems locally (which would miss older matches).
  onFilterChange?: (filter: ActivityCategoryFilter) => void;
  activityStatus?: "loading" | "ready" | "error";
  activityError?: string | null;
  onRetry?: () => void;
}) {
  const [internalFilter, setInternalFilter] = useState<ActivityCategoryFilter>("all");
  const selectedFilter = selectedFilterProp ?? internalFilter;
  const visibleItems = onFilterChange
    ? activity.items.slice(0, 5)
    : activity.allItems
        .filter((item) => selectedFilter === "all" || item.categoryFilters.includes(selectedFilter))
        .slice(0, 5);
  const hasActivity = activity.allItems.length > 0;

  const handleSelectFilter = (filter: ActivityCategoryFilter) => {
    if (selectedFilterProp === undefined) setInternalFilter(filter);
    onFilterChange?.(filter);
  };

  return (
    <Section
      title="Recent activity"
      actionLabel={hasActivity && onSeeAll ? "See all" : undefined}
      onAction={onSeeAll}
    >
      {hasActivity && activity.filters.length > 1 ? (
        <ActivityFilterPills
          filters={activity.filters}
          onSelect={handleSelectFilter}
          selectedFilter={selectedFilter}
        />
      ) : null}

      {activityStatus === "loading" ? (
        <SkeletonRows count={3} />
      ) : activityStatus === "error" ? (
        <View className="rounded-card bg-card">
          <ErrorState compact title="Couldn't load recent activity" body={activityError} onRetry={onRetry} />
        </View>
      ) : visibleItems.length === 0 ? (
        <View className="rounded-card bg-card">
          <EmptyState
            compact
            icon="rupee-receipt"
            art={hasActivity ? undefined : "hero-calendar"}
            visual={hasActivity ? <EmptyReceipt size={72} /> : undefined}
            title={hasActivity ? "Nothing in this filter" : "No activity yet"}
            body={hasActivity ? "Try another category." : "Payments show up here once messages are captured."}
          />
        </View>
      ) : (
        <RowGroup animated>
          {visibleItems.map((item) => (
            <ActivityItemRow key={item.key} item={item} onPress={onSelect} />
          ))}
        </RowGroup>
      )}
    </Section>
  );
}
