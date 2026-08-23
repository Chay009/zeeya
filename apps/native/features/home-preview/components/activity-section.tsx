import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { activityItems } from "../data";
import { hp } from "../theme";
import { BrandLogo } from "./brand-logo";

export function ActivitySection() {
  return (
    <View style={{ marginTop: 24, paddingBottom: 8 }}>
      <View
        style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}
      >
        <View>
          <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 2, color: hp.muted }}>
            SPENDING DIARY
          </Text>
          <Text style={{ marginTop: 4, fontSize: 24, fontWeight: "800", color: hp.ink }}>
            Recent activity
          </Text>
        </View>
        <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingBottom: 4 }}>
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
          TODAY, 23 MAY
        </Text>

        {activityItems.map((item, index) => (
          <View
            key={item.name}
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
            </View>
            <Text style={{ fontSize: 15, fontWeight: "800", color: hp.coral }}>{item.amount}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
