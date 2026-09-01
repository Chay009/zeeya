import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, Text, View } from "react-native";

import type { ActivityItem } from "../data";
import { transactionDetailSections } from "../data";
import { hp } from "../theme";
import { BrandLogo } from "./brand-logo";
import {
  previewCircleButtonStyle,
  previewEyebrowStyle,
  previewScreenTitleStyle,
} from "./subscription-ui";

export function TransactionDetail({
  item,
  onBack,
  topInset,
}: {
  item: ActivityItem;
  onBack: () => void;
  topInset: number;
}) {
  const sections = transactionDetailSections(item.raw);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: Math.max(12, topInset),
        paddingBottom: 32,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressable
          onPress={onBack}
          accessibilityLabel="Back to activity"
          style={previewCircleButtonStyle}
        >
          <Ionicons name="chevron-back" size={20} color={hp.inkSoft} />
        </Pressable>
        <View style={{ minWidth: 0, alignItems: "center", flex: 1, paddingHorizontal: 12 }}>
          <Text style={previewEyebrowStyle}>TRANSACTION</Text>
          <Text numberOfLines={1} style={previewScreenTitleStyle}>
            {item.name}
          </Text>
        </View>
        <View style={{ width: 42 }} />
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
            letter={item.letter}
            tile={item.tile}
            ink={item.ink}
            img={item.img}
            size={48}
            radius={16}
            iconRatio={0.66}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: "800", color: hp.ink }}>
              {item.name}
            </Text>
            <Text style={{ marginTop: 4, fontSize: 12, color: hp.mutedSoft }}>{item.sub}</Text>
          </View>
          {item.amount && (
            <Text
              style={{
                fontSize: 18,
                fontWeight: "800",
                color: item.direction === "income" ? hp.emeraldDeep : hp.coral,
              }}
            >
              {item.amount}
            </Text>
          )}
        </View>
      </View>

      {sections.map((section) => (
        <View key={section.title} style={{ marginTop: 24 }}>
          <Text style={previewEyebrowStyle}>{section.title.toUpperCase()}</Text>
          <View
            style={{
              marginTop: 10,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: hp.border,
              backgroundColor: "rgba(255,255,255,0.72)",
              overflow: "hidden",
            }}
          >
            {section.rows.map((row, index) => (
              <View
                key={row.label}
                style={{
                  flexDirection: "row",
                  gap: 12,
                  padding: 14,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: hp.border,
                }}
              >
                <Text style={{ width: 120, fontSize: 11, fontWeight: "700", color: hp.mutedSoft }}>
                  {row.label}
                </Text>
                <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: hp.ink }}>
                  {row.value}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
