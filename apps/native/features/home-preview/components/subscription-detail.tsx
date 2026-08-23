import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, Text, View } from "react-native";

import type { PreviewSub } from "../data";
import { hp } from "../theme";
import { BrandLogo } from "./brand-logo";
import {
  previewCircleButtonStyle,
  previewEyebrowStyle,
  previewScreenTitleStyle,
  SubscriptionStatusBadge,
  SubscriptionTypeBadge,
} from "./subscription-ui";

export function SubscriptionDetail({
  subscription,
  onBack,
  topInset,
}: {
  subscription: PreviewSub;
  onBack: () => void;
  topInset: number;
}) {
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
          accessibilityLabel="Back to subscriptions"
          style={previewCircleButtonStyle}
        >
          <Ionicons name="chevron-back" size={20} color={hp.inkSoft} />
        </Pressable>
        <View style={{ minWidth: 0, alignItems: "center", flex: 1, paddingHorizontal: 12 }}>
          <Text style={previewEyebrowStyle}>SUBSCRIPTION</Text>
          <Text numberOfLines={1} style={previewScreenTitleStyle}>
            {subscription.name}
          </Text>
        </View>
        <Pressable accessibilityLabel="More options" style={previewCircleButtonStyle}>
          <Ionicons name="ellipsis-horizontal" size={19} color={hp.inkSoft} />
        </Pressable>
      </View>

      <View
        style={{
          marginTop: 24,
          borderRadius: 27,
          borderWidth: 1,
          borderColor: hp.border,
          backgroundColor: "rgba(255,255,255,0.8)",
          padding: 20,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <BrandLogo
            letter={subscription.letter}
            tile={subscription.tile}
            ink={subscription.ink}
            img={subscription.img}
            size={48}
            radius={16}
            iconRatio={0.66}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: "800", color: hp.ink }}>
              {subscription.name}
            </Text>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 6,
                marginTop: 6,
              }}
            >
              <SubscriptionTypeBadge subscription={subscription} />
              <SubscriptionStatusBadge subscription={subscription} contained />
            </View>
          </View>
        </View>
        <View
          style={{
            flexDirection: "row",
            marginTop: 20,
            paddingTop: 16,
            borderTopWidth: 1,
            borderTopColor: "#eef4ef",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={metricLabel}>AMOUNT</Text>
            <Text style={metricValue}>
              {subscription.amount}{" "}
              <Text style={{ fontSize: 10, fontWeight: "500", color: hp.mutedSoft }}>/ month</Text>
            </Text>
          </View>
          <View
            style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: "#eef4ef", paddingLeft: 16 }}
          >
            <Text style={metricLabel}>NEXT RENEWAL</Text>
            <Text style={metricValue}>{subscription.renew}</Text>
          </View>
        </View>
      </View>

      <View style={{ marginTop: 28, paddingBottom: 8 }}>
        <Text style={previewEyebrowStyle}>STATUS HISTORY</Text>
        <Text
          style={{
            marginTop: 4,
            fontSize: 23,
            fontWeight: "800",
            letterSpacing: -1.4,
            color: hp.ink,
          }}
        >
          Timeline
        </Text>
        <View style={{ marginTop: 20 }}>
          {subscription.timeline.map((event, index) => (
            <View
              key={`${event.label}-${event.time}`}
              style={{ flexDirection: "row", minHeight: 62 }}
            >
              <View style={{ width: 28, alignItems: "center" }}>
                <View
                  style={{
                    width: 10,
                    height: 10,
                    marginTop: 4,
                    borderRadius: 5,
                    backgroundColor: event.dot,
                    borderWidth: 2,
                    borderColor: hp.background,
                  }}
                />
                {index < subscription.timeline.length - 1 && (
                  <View
                    style={{ width: 1, flex: 1, marginVertical: 3, backgroundColor: hp.border }}
                  />
                )}
              </View>
              <View style={{ flex: 1, paddingBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "800", color: hp.ink }}>
                  {event.label}
                </Text>
                <Text style={{ marginTop: 3, fontSize: 12, color: hp.mutedSoft }}>
                  {event.time}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const metricLabel = {
  fontSize: 10,
  fontWeight: "700" as const,
  letterSpacing: 1.6,
  color: hp.mutedSoft,
};
const metricValue = {
  marginTop: 4,
  fontSize: 22,
  fontWeight: "800" as const,
  letterSpacing: -1,
  color: hp.ink,
};
