import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";
import { EnterTransition } from "@/components/native-ui/enter-transition";
import { LimeActionPill, SelectedPill } from "@/components/native-ui/selected-pill";

import type { ActivityCategoryFilter } from "@/lib/activity-filters";
import type { ActivityRowPresentation } from "../data";
import { hp } from "../theme";
import { ActivityTagRow } from "./activity-tags";
import { BrandLogo } from "./brand-logo";
import { EmptyNote } from "./empty-note";

// Both real activity shapes (the legacy Dashboard-backed ActivityItem and
// the bounded-read-model HomeActivityViewItem) share this same
// dateLabel/filters/items/allItems shape — only the item type itself
// differs. Kept generic so ActivitySection can render either without
// branching on which path produced it.
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
      contentContainerStyle={{ gap: 8, paddingBottom: 8 }}
    >
      {filters.map((filter) => (
        <SelectedPill
          key={filter.value}
          selected={selectedFilter === filter.value}
          label={filter.label}
          detail={String(filter.count)}
          onPress={() => onSelect(filter.value)}
        />
      ))}
    </ScrollView>
  );
}

export function ActivityItemRow<Item extends ActivityRowPresentation>({
  item,
  index,
  onPress,
}: {
  item: Item;
  index: number;
  onPress?: (item: Item) => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? `View details for ${item.name}` : undefined}
      onPress={onPress ? () => onPress(item) : undefined}
      className={`flex-row items-center gap-3 rounded-[18px] py-3 ${index === 0 ? "" : "border-t border-border"}`}
    >
      <View className="overflow-hidden">
        <BrandLogo
          letter={item.letter}
          tile={item.tile}
          ink={item.ink}
          img={item.img}
          size={40}
          radius={14}
          iconRatio={0.7}
        />
        <View className="absolute inset-x-0 bottom-0 h-[3px]" style={{ backgroundColor: item.bar }} />
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-subtitle font-extrabold text-ink">
          {item.name}
        </Text>
        <Text numberOfLines={1} className="mt-0.5 text-caption text-muted-soft">
          {item.sub}
        </Text>
        <ActivityTagRow
          tags={[
            ...item.categorySuggestions.slice(0, 3).map((category) => ({
              key: `${item.key}:category:${category.key}`,
              label: category.label,
              tone: "subcategory" as const,
            })),
            ...item.pills.map((pill) => ({
              key: `${item.key}:${pill.key}`,
              label: pill.label,
              tone: pill.tone,
            })),
          ]}
        />
      </View>
      {item.amount && (
        <View
          className={`max-w-[116px] rounded-pill px-2 py-[5px] ${
            item.direction === "income" ? "bg-chip-bg" : "bg-expense-bg"
          }`}
        >
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            className={`text-sm font-extrabold ${
              item.direction === "income" ? "text-emerald-deep" : "text-coral"
            }`}
          >
            {item.amount}
          </Text>
        </View>
      )}
    </Pressable>
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
  // When provided, filtering is server-driven: the parent has already
  // fetched a filter-scoped slice via home.loadRecentActivity and passed
  // it as activity.items (the first N rows in the currently-selected
  // category's own server-side ordering). ActivitySection renders
  // activity.items directly in that mode — filtering activity.allItems
  // locally would defeat the whole point of the server-side fetch (a
  // category whose newest match is 6th-or-later in the unfiltered global
  // feed would still show empty after JS-side filtering, since the
  // allItems cap already excluded it). When onFilterChange is omitted
  // (the legacy Dashboard path), activity.items equals activity.allItems
  // by construction and local filtering of allItems is the only option.
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
    if (selectedFilterProp === undefined) {
      setInternalFilter(filter);
    }
    onFilterChange?.(filter);
  };

  return (
    <View className="pb-2">
      <View className="flex-row items-end justify-between">
        <View>
          <Text className="text-label font-bold tracking-[2px] text-muted">SPENDING DIARY</Text>
          <Text className="mt-1 text-2xl font-extrabold tracking-tighter text-ink">
            Recent activity
          </Text>
        </View>
        <LimeActionPill
          accessibilityLabel="See all activity"
          disabled={!hasActivity || !onSeeAll}
          onPress={onSeeAll}
          className={hasActivity && onSeeAll ? "opacity-100" : "opacity-45"}
        >
          <Text className="text-caption font-extrabold text-on-accent">See all</Text>
          <AppIcon name="arrow-up-right" size={14} color={hp.onAccent} />
        </LimeActionPill>
      </View>

      <View className="mt-3">
        <Text className="mb-1 px-1 text-label font-bold tracking-widest text-sage-faint">
          {activity.dateLabel}
        </Text>

        {hasActivity && (
          <ActivityFilterPills
            filters={activity.filters}
            onSelect={handleSelectFilter}
            selectedFilter={selectedFilter}
          />
        )}

        {activityStatus === "loading" ? (
          <Text className="text-[13px] text-muted-soft">Loading recent activity...</Text>
        ) : activityStatus === "error" ? (
          <View>
            <Text className="text-[13px] font-bold text-ink">Couldn&apos;t load recent activity</Text>
            <Text className="mt-1 text-caption text-muted-soft" numberOfLines={3}>
              {activityError ?? "Try again in a moment."}
            </Text>
            {onRetry && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry loading recent activity"
                onPress={onRetry}
                className="mt-2 self-start"
              >
                <Text className="text-caption font-extrabold text-accent-deep">Retry</Text>
              </Pressable>
            )}
          </View>
        ) : visibleItems.length === 0 ? (
          <EmptyNote
            icon="rupee-receipt"
            title={hasActivity ? "Nothing in this filter" : "No recent activity"}
            body={
              hasActivity
                ? "Try All, or another category, to see the latest captured payments."
                : "Once SMS and statements are ingested, today’s spends and credits show up here."
            }
          />
        ) : (
          visibleItems.map((item, index) => (
            <EnterTransition key={item.key} index={Math.min(index, 7)}>
              <ActivityItemRow item={item} index={index} onPress={onSelect} />
            </EnterTransition>
          ))
        )}
      </View>
    </View>
  );
}
