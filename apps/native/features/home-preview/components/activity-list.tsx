import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import type { ActivityCategoryFilter } from "@/lib/activity-filters";
import type { ActivityItem, HomePreviewData } from "../data";
import { hp } from "../theme";
import { ActivityFilterPills, ActivityItemRow } from "./activity-section";
import {
  previewCircleButtonStyle,
  previewEyebrowStyle,
  previewScreenTitleStyle,
} from "./subscription-ui";

export function ActivityList({
  activity,
  onBack,
  topInset,
}: {
  activity: HomePreviewData["activity"];
  onBack: () => void;
  topInset: number;
}) {
  const [selectedFilter, setSelectedFilter] = useState<ActivityCategoryFilter>("all");
  const visibleItems = useMemo(
    () =>
      activity.allItems.filter(
        (item) => selectedFilter === "all" || item.categoryFilters.includes(selectedFilter),
      ),
    [activity.allItems, selectedFilter],
  );

  return (
    <FlatList<ActivityItem>
      data={visibleItems}
      keyExtractor={(item) => item.key}
      renderItem={({ item, index }) => <ActivityItemRow item={item} index={index} />}
      ListHeaderComponent={
        <View style={{ paddingHorizontal: 20 }}>
          <View
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          >
            <Pressable
              onPress={onBack}
              accessibilityLabel="Back to home"
              style={previewCircleButtonStyle}
            >
              <Ionicons name="chevron-back" size={20} color={hp.inkSoft} />
            </Pressable>
            <View style={{ alignItems: "center" }}>
              <Text style={previewEyebrowStyle}>SPENDING DIARY</Text>
              <Text style={previewScreenTitleStyle}>Activity</Text>
            </View>
            <View style={{ width: 42 }} />
          </View>

          <View style={{ marginTop: 24 }}>
            <Text style={previewEyebrowStyle}>ALL TRANSACTIONS</Text>
            <Text
              style={{
                marginTop: 6,
                fontSize: 26,
                fontWeight: "800",
                letterSpacing: -1.55,
                color: hp.ink,
              }}
            >
              Your activity
            </Text>
            <Text style={{ marginTop: 4, fontSize: 12, color: hp.muted }}>
              {activity.dateLabel}
            </Text>
          </View>

          {activity.allItems.length > 0 && (
            <View style={{ marginTop: 16 }}>
              <ActivityFilterPills
                activity={activity}
                onSelect={setSelectedFilter}
                selectedFilter={selectedFilter}
              />
            </View>
          )}

          <Text
            style={{
              marginTop: 12,
              marginBottom: 4,
              fontSize: 10,
              fontWeight: "700",
              letterSpacing: 1.6,
              color: hp.muted,
            }}
          >
            {visibleItems.length} {visibleItems.length === 1 ? "entry" : "entries"}
          </Text>
        </View>
      }
      ListEmptyComponent={
        <View style={{ marginHorizontal: 20, paddingVertical: 28 }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: hp.inkSoft }}>
            No activity yet
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: hp.muted }}>
            Connect your messages to see transactions here.
          </Text>
        </View>
      }
      contentContainerStyle={{ paddingTop: Math.max(12, topInset), paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
      style={{ flex: 1 }}
    />
  );
}
