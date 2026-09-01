import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import type { ActivityCategoryFilter } from "@/lib/activity-filters";
import type { ActivityItem, ActivityPill, HomePreviewData } from "../data";
import { hp } from "../theme";
import { BrandLogo } from "./brand-logo";

const PILL_COLORS: Record<ActivityPill["tone"], { background: string; text: string }> = {
  recurring: { background: "#eee4fb", text: "#8e61bf" },
  type: { background: hp.chipBg, text: hp.emeraldDeep },
  subcategory: { background: "#e4eefb", text: "#4a7bc9" },
  mandate: { background: "#fdeee0", text: "#c07a2a" },
  card: { background: "#12251f", text: "#ffffff" },
  bank: { background: "#f1f5ef", text: hp.inkSoft },
};

export function ActivityFilterPills({
  activity,
  onSelect,
  selectedFilter,
}: {
  activity: HomePreviewData["activity"];
  onSelect: (filter: ActivityCategoryFilter) => void;
  selectedFilter: ActivityCategoryFilter;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingBottom: 8 }}
    >
      {activity.filters.map((filter) => {
        const selected = selectedFilter === filter.value;
        return (
          <Pressable
            key={filter.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onSelect(filter.value)}
            style={{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: selected ? hp.inkDeep : hp.border,
              backgroundColor: selected ? hp.inkDeep : "rgba(255,255,255,0.6)",
              paddingHorizontal: 13,
              paddingVertical: 8,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Text
              style={{
                color: selected ? hp.lime : "#58635a",
                fontSize: 11,
                fontWeight: "800",
              }}
            >
              {filter.label}
            </Text>
            <Text style={{ color: selected ? "#9db8a9" : "#9aa79f", fontSize: 11 }}>
              {filter.count}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function ActivityItemRow({
  item,
  index,
  onPress,
}: {
  item: ActivityItem;
  index: number;
  onPress?: (item: ActivityItem) => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? `View details for ${item.name}` : undefined}
      onPress={onPress ? () => onPress(item) : undefined}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderRadius: 18,
        paddingVertical: 12,
        borderTopWidth: index === 0 ? 0 : 1,
        borderTopColor: hp.border,
      }}
    >
      <View style={{ overflow: "hidden" }}>
        <BrandLogo
          letter={item.letter}
          tile={item.tile}
          ink={item.ink}
          img={item.img}
          size={40}
          radius={14}
          iconRatio={0.7}
        />
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 3,
            backgroundColor: item.bar,
          }}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "800", color: hp.ink }}>
          {item.name}
        </Text>
        <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 12, color: hp.mutedSoft }}>
          {item.sub}
        </Text>
        <View style={{ marginTop: 5, flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
          {item.categorySuggestions.slice(0, 3).map((category, categoryIndex) => (
            <View
              key={`${item.key}:category:${category.key}`}
              style={{
                borderRadius: 999,
                backgroundColor: categoryIndex === 0 ? hp.chipBg : "#f1f5ef",
                paddingHorizontal: 7,
                paddingVertical: 3,
              }}
            >
              <Text
                style={{
                  color: categoryIndex === 0 ? hp.emeraldDeep : hp.inkSoft,
                  fontSize: 9,
                  fontWeight: "800",
                }}
              >
                {category.label}
              </Text>
            </View>
          ))}
          {item.pills.map((pill) => {
            const colors = PILL_COLORS[pill.tone];
            return (
              <View
                key={`${item.key}:${pill.key}`}
                style={{
                  borderRadius: 999,
                  backgroundColor: colors.background,
                  paddingHorizontal: 7,
                  paddingVertical: 3,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 9, fontWeight: "800" }}>
                  {pill.label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
      {item.amount && (
        <View
          style={{
            borderRadius: 999,
            backgroundColor: item.direction === "income" ? hp.chipBg : "#fbe2da",
            paddingHorizontal: 8,
            paddingVertical: 5,
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: "800",
              color: item.direction === "income" ? hp.emeraldDeep : hp.coral,
            }}
          >
            {item.amount}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function ActivitySection({
  activity,
  onSeeAll,
  onSelect,
}: {
  activity: HomePreviewData["activity"];
  onSeeAll?: () => void;
  onSelect?: (item: ActivityItem) => void;
}) {
  const [selectedFilter, setSelectedFilter] = useState<ActivityCategoryFilter>("all");
  const visibleItems = activity.allItems
    .filter((item) => selectedFilter === "all" || item.categoryFilters.includes(selectedFilter))
    .slice(0, 5);
  const hasActivity = activity.allItems.length > 0;

  return (
    <View style={{ marginTop: 24, paddingBottom: 8 }}>
      <View
        style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}
      >
        <View>
          <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 2, color: hp.muted }}>
            SPENDING DIARY
          </Text>
          <Text
            style={{
              marginTop: 4,
              fontSize: 24,
              fontWeight: "800",
              letterSpacing: -1.45,
              color: hp.ink,
            }}
          >
            Recent activity
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="See all activity"
          accessibilityState={{ disabled: !hasActivity || !onSeeAll }}
          disabled={!hasActivity || !onSeeAll}
          onPress={onSeeAll}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingBottom: 4,
            opacity: hasActivity && onSeeAll ? 1 : 0.45,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "800", color: hp.emeraldDeep }}>See all</Text>
          <Ionicons
            name="arrow-up"
            size={14}
            color={hp.emeraldDeep}
            style={{ transform: [{ rotate: "45deg" }] }}
          />
        </Pressable>
      </View>

      <View style={{ marginTop: 12 }}>
        <Text
          style={{
            marginBottom: 4,
            paddingHorizontal: 4,
            fontSize: 10,
            fontWeight: "700",
            letterSpacing: 1.6,
            color: "#7d8980",
          }}
        >
          {activity.dateLabel}
        </Text>

        {hasActivity && (
          <ActivityFilterPills
            activity={activity}
            onSelect={setSelectedFilter}
            selectedFilter={selectedFilter}
          />
        )}

        {visibleItems.length === 0 ? (
          <Text style={{ fontSize: 13, color: hp.mutedSoft }}>No recent activity</Text>
        ) : (
          visibleItems.map((item, index) => (
            <ActivityItemRow key={item.key} item={item} index={index} onPress={onSelect} />
          ))
        )}
      </View>
    </View>
  );
}
