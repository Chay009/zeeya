import { Ionicons } from "@expo/vector-icons";
import * as React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { previewSubs } from "../data";
import type { PreviewSub } from "../data";
import { hp } from "../theme";
import { BrandLogo } from "./brand-logo";
import {
  previewCircleButtonStyle,
  previewEyebrowStyle,
  previewScreenTitleStyle,
  ReactivatedBadge,
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
}: {
  onBack: () => void;
  onSelect: (subscription: PreviewSub) => void;
  topInset: number;
}) {
  const [filter, setFilter] = React.useState<Filter>("all");
  const visible = filter === "all" ? previewSubs : previewSubs.filter((sub) => sub.type === filter);
  const count = (key: Filter) =>
    key === "all" ? previewSubs.length : previewSubs.filter((sub) => sub.type === key).length;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: Math.max(12, topInset),
        paddingBottom: 140,
      }}
      showsVerticalScrollIndicator={false}
    >
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
        <Pressable
          accessibilityLabel="Add subscription"
          style={[
            previewCircleButtonStyle,
            { backgroundColor: hp.inkDeep, borderColor: hp.inkDeep },
          ]}
        >
          <Ionicons name="add" size={20} color={hp.lime} />
        </Pressable>
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
        <View>
          <Text style={previewEyebrowStyle}>MONTHLY SPEND</Text>
          <Text
            style={{
              marginTop: 8,
              fontSize: 32,
              fontWeight: "800",
              letterSpacing: -2,
              color: hp.ink,
            }}
          >
            ₹27,498{" "}
            <Text style={{ fontSize: 11, letterSpacing: 0, color: hp.mutedSoft }}>/ month</Text>
          </Text>
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
            4 active · 1 cancelled
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

      <View
        style={{
          borderRadius: 24,
          borderWidth: 1,
          borderColor: hp.border,
          backgroundColor: "rgba(255,255,255,0.75)",
          paddingHorizontal: 16,
        }}
      >
        {visible.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 32 }}>
            <Text style={{ fontSize: 14, fontWeight: "800", color: hp.inkSoft }}>
              Nothing here yet
            </Text>
            <Text style={{ marginTop: 4, fontSize: 12, color: hp.muted }}>
              Try another filter to see your recurring payments.
            </Text>
          </View>
        ) : (
          visible.map((sub, index) => (
            <Pressable
              key={sub.key}
              onPress={() => onSelect(sub)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingVertical: 12,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: "#eef4ef",
              }}
            >
              <BrandLogo
                letter={sub.letter}
                tile={sub.tile}
                ink={sub.ink}
                img={sub.img}
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
                    color: sub.status === "Cancelled" ? "#7c8a80" : hp.ink,
                  }}
                >
                  {sub.name}
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
                  <SubscriptionStatusBadge subscription={sub} />
                  <Text style={{ fontSize: 11, color: hp.mutedSoft }}>
                    {sub.status === "Cancelled" ? "14 Jul" : `Renews ${sub.renew}`}
                  </Text>
                  {sub.reactivated && <ReactivatedBadge />}
                  <SubscriptionTypeBadge subscription={sub} />
                </View>
              </View>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "800",
                  color: sub.status === "Cancelled" ? "#7d8980" : hp.ink,
                  textDecorationLine: sub.status === "Cancelled" ? "line-through" : "none",
                  textDecorationColor: "#b8b5ab",
                }}
              >
                {sub.amount}
              </Text>
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}
