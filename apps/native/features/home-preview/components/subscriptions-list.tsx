import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";

import type { HomePreviewData, PreviewSub } from "../data";
import { hp } from "../theme";
import { BrandLogo } from "./brand-logo";
import {
  previewCircleButtonStyle,
  previewEyebrowStyle,
  previewScreenTitleStyle,
  ReactivatedBadge,
  SubscriptionSpendValue,
  SubscriptionStatusBadge,
  SubscriptionTypeBadge,
} from "./subscription-ui";

type Filter = "all" | PreviewSub["type"];

const filters: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "autopay", label: "Autopay" },
  { key: "recurring", label: "Recurring" },
  { key: "manual", label: "Added by me" },
];

export function SubscriptionsList({
  onBack,
  onSelect,
  topInset,
  subscriptions,
}: {
  onBack: () => void;
  onSelect: (subscription: PreviewSub) => void;
  topInset: number;
  subscriptions: HomePreviewData["subscriptions"];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const visible = useMemo(
    () =>
      filter === "all"
        ? subscriptions.items
        : subscriptions.items.filter((sub) => sub.type === filter),
    [filter, subscriptions.items],
  );
  const count = (key: Filter) =>
    key === "all"
      ? subscriptions.items.length
      : subscriptions.items.filter((sub) => sub.type === key).length;

  const header = (
    <View style={{ paddingHorizontal: 20 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressable
          onPress={onBack}
          accessibilityLabel="Back to home"
          style={previewCircleButtonStyle}
        >
          <Ionicons name="chevron-back" size={20} color={hp.inkSoft} />
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={previewEyebrowStyle}>RECURRING PAYMENTS</Text>
          <Text style={previewScreenTitleStyle}>Subscriptions</Text>
        </View>
        <View style={{ width: 42 }} />
      </View>

      <View
        style={{
          marginTop: 24,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: hp.border,
          paddingVertical: 20,
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={previewEyebrowStyle}>MONTHLY SPEND</Text>
          <SubscriptionSpendValue value={subscriptions.monthlySpend} size={32} />
        </View>
        <View
          style={{
            borderRadius: 999,
            backgroundColor: hp.chipBg,
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: "800", color: hp.emeraldDeep }}>
            {subscriptions.activeCount} active · {subscriptions.cancelledCount} cancelled
          </Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: 20 }}
      >
        {filters.map((item) => {
          const selected = item.key === filter;
          return (
            <Pressable
              key={item.key}
              onPress={() => setFilter(item.key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                borderRadius: 999,
                paddingHorizontal: 14,
                paddingVertical: 8,
                backgroundColor: selected ? hp.inkDeep : "rgba(255,255,255,0.6)",
                borderWidth: selected ? 0 : 1,
                borderColor: hp.border,
              }}
            >
              <Text
                style={{ fontSize: 11, fontWeight: "800", color: selected ? hp.lime : "#58635a" }}
              >
                {item.label}
              </Text>
              <Text
                style={{ fontSize: 11, fontWeight: "700", color: selected ? "#9db8a9" : "#9aa79f" }}
              >
                {count(item.key)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {visible.length > 0 && (
        <Text
          style={{
            marginBottom: 8,
            fontSize: 10,
            fontWeight: "700",
            letterSpacing: 1.6,
            color: hp.muted,
          }}
        >
          {visible.length} {visible.length === 1 ? "subscription" : "subscriptions"}
        </Text>
      )}
    </View>
  );

  return (
    <FlatList<PreviewSub>
      data={visible}
      keyExtractor={(item) => item.key}
      renderItem={({ item, index }) => {
        const first = index === 0;
        const last = index === visible.length - 1;
        return (
          <Pressable
            onPress={() => onSelect(item)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.name}`}
            style={{
              marginHorizontal: 20,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingHorizontal: 16,
              paddingVertical: 12,
              backgroundColor: "rgba(255,255,255,0.75)",
              borderLeftWidth: 1,
              borderRightWidth: 1,
              borderColor: hp.border,
              borderTopWidth: 1,
              borderTopColor: hp.border,
              borderBottomWidth: last ? 1 : 0,
              borderBottomColor: hp.border,
              borderTopLeftRadius: first ? 24 : 0,
              borderTopRightRadius: first ? 24 : 0,
              borderBottomLeftRadius: last ? 24 : 0,
              borderBottomRightRadius: last ? 24 : 0,
            }}
          >
            <BrandLogo
              letter={item.letter}
              tile={item.tile}
              ink={item.ink}
              img={item.img}
              size={44}
              radius={15}
              iconRatio={0.64}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 15,
                  fontWeight: "800",
                  color: item.status === "Cancelled" ? "#7c8a80" : hp.ink,
                }}
              >
                {item.name}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 6,
                  marginTop: 5,
                }}
              >
                <SubscriptionStatusBadge subscription={item} />
                <Text style={{ fontSize: 11, color: hp.mutedSoft }}>{item.dateLabel}</Text>
                {item.reactivated && <ReactivatedBadge />}
                <SubscriptionTypeBadge subscription={item} />
              </View>
            </View>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "800",
                color: item.status === "Cancelled" ? "#7d8980" : hp.ink,
                textDecorationLine: item.status === "Cancelled" ? "line-through" : "none",
                textDecorationColor: "#b8b5ab",
              }}
            >
              {item.amount}
            </Text>
          </Pressable>
        );
      }}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <View
          style={{
            marginHorizontal: 20,
            borderWidth: 1,
            borderColor: hp.border,
            borderRadius: 24,
            backgroundColor: "rgba(255,255,255,0.75)",
            alignItems: "center",
            paddingVertical: 32,
            paddingHorizontal: 20,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "800", color: hp.inkSoft }}>
            Nothing here yet
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: hp.muted, textAlign: "center" }}>
            Try another filter to see your recurring payments.
          </Text>
        </View>
      }
      contentContainerStyle={{ paddingTop: Math.max(12, topInset), paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
      style={{ flex: 1 }}
    />
  );
}
