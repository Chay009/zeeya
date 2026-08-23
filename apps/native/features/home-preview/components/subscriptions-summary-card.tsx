import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  Text,
  View,
} from "react-native";

import { previewSubs } from "../data";
import { hp } from "../theme";
import { BrandLogo } from "./brand-logo";

type Mode = "stack" | "horizontal" | "vertical";

const MODE_ICONS: Record<Mode, keyof typeof Ionicons.glyphMap> = {
  stack: "layers-outline",
  horizontal: "swap-horizontal",
  vertical: "swap-vertical",
};

export function SubscriptionsSummaryCard({ onOpen }: { onOpen?: () => void }) {
  const [mode, setMode] = useState<Mode>("stack");
  const [active, setActive] = useState(0);
  const [trackSize, setTrackSize] = useState({ width: 0, height: 0 });
  const listRef = useRef<FlatList<(typeof previewSubs)[number]>>(null);

  const vertical = mode === "vertical";
  const trackLength = vertical ? trackSize.height : trackSize.width;
  const itemLength = Math.round(trackLength * 0.8);

  useEffect(() => {
    setActive(0);
  }, [mode]);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!itemLength) return;
    const offset = vertical ? e.nativeEvent.contentOffset.y : e.nativeEvent.contentOffset.x;
    setActive(Math.max(0, Math.min(previewSubs.length - 1, Math.round(offset / itemLength))));
  };

  const goTo = (index: number) => {
    setActive(index);
    listRef.current?.scrollToOffset({ offset: index * itemLength, animated: true });
  };

  const items = useMemo(() => previewSubs, []);

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel="Open subscriptions"
      style={{
        marginTop: 16,
        minHeight: 116,
        borderRadius: 27,
        borderWidth: 1,
        borderColor: hp.border,
        backgroundColor: "rgba(255,255,255,0.8)",
        padding: 12,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1.8, color: hp.muted }}>
              SUBSCRIPTIONS
            </Text>
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: hp.emerald }} />
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                setMode(
                  mode === "stack" ? "horizontal" : mode === "horizontal" ? "vertical" : "stack",
                );
              }}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={
                mode === "stack"
                  ? "Browse subscriptions horizontally"
                  : mode === "horizontal"
                    ? "Browse subscriptions vertically"
                    : "Show stacked subscriptions"
              }
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: hp.border,
                backgroundColor: hp.background,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name={MODE_ICONS[mode]} size={13} color="#527363" />
            </Pressable>
          </View>
          <Text style={{ marginTop: 6, fontSize: 28, fontWeight: "800", color: hp.ink }}>
            ₹27,498{" "}
            <Text style={{ fontSize: 10, fontWeight: "700", color: hp.mutedSoft }}>/ month</Text>
          </Text>
          <Text
            numberOfLines={1}
            style={{ marginTop: 6, fontSize: 11, fontWeight: "700", color: hp.emeraldDeep }}
          >
            {mode === "stack" ? "4 active" : previewSubs[active].meta}
          </Text>
        </View>

        {mode === "stack" ? (
          <View style={{ alignItems: "flex-end", gap: 8 }}>
            <View style={{ flexDirection: "row", marginLeft: -8 }}>
              {previewSubs.slice(0, 4).map((sub, i) => (
                <View key={sub.key} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                  <BrandLogo
                    letter={i === 3 ? "+" : sub.letter}
                    tile={sub.tile}
                    ink={sub.ink}
                    img={sub.img}
                    size={28}
                    radius={14}
                    iconRatio={0.7}
                  />
                </View>
              ))}
            </View>
            <View
              style={{
                paddingHorizontal: 6,
                height: 28,
                borderRadius: 14,
                backgroundColor: hp.background,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: "800", color: hp.mutedSoft }}>+1</Text>
            </View>
          </View>
        ) : (
          <View
            onLayout={(e) =>
              setTrackSize({
                width: e.nativeEvent.layout.width,
                height: e.nativeEvent.layout.height,
              })
            }
            style={[
              {
                flex: 1,
                minWidth: 0,
                maxWidth: 170,
                height: 92,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#edf2ed",
                backgroundColor: hp.card,
                overflow: "hidden",
              },
              vertical ? { alignSelf: "stretch", width: undefined } : null,
            ]}
          >
            <FlatList
              key={mode}
              ref={listRef}
              data={items}
              keyExtractor={(s) => s.key}
              horizontal={!vertical}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              snapToInterval={itemLength || undefined}
              decelerationRate="fast"
              onMomentumScrollEnd={onScrollEnd}
              contentContainerStyle={{ alignItems: vertical ? "stretch" : "center" }}
              renderItem={({ item, index }) => (
                <Pressable
                  onPress={(event) => {
                    event.stopPropagation();
                    goTo(index);
                  }}
                  style={{
                    width: vertical ? undefined : itemLength || trackSize.width,
                    minHeight: vertical ? undefined : "100%",
                    height: vertical ? itemLength || trackSize.height : undefined,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${item.name}`}
                >
                  <View
                    style={{
                      opacity: index === active ? 1 : 0.6,
                      transform: [{ scale: index === active ? 1.1 : 1 }],
                    }}
                  >
                    <BrandLogo
                      letter={item.letter}
                      tile={item.tile}
                      ink={item.ink}
                      img={item.img}
                      size={64}
                      radius={32}
                      iconRatio={0.75}
                    />
                  </View>
                </Pressable>
              )}
            />
            <View
              style={
                vertical
                  ? {
                      position: "absolute",
                      right: 2,
                      top: 0,
                      bottom: 0,
                      justifyContent: "center",
                      gap: 4,
                    }
                  : {
                      position: "absolute",
                      bottom: 2,
                      left: 0,
                      right: 0,
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: 4,
                    }
              }
            >
              {previewSubs.map((sub, i) => (
                <Pressable
                  key={sub.key}
                  onPress={(event) => {
                    event.stopPropagation();
                    goTo(i);
                  }}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${sub.name}`}
                  style={{
                    height: vertical ? (i === active ? 12 : 6) : 6,
                    width: vertical ? 6 : i === active ? 12 : 6,
                    borderRadius: 3,
                    backgroundColor: i === active ? hp.emerald : "#cfe0d4",
                  }}
                />
              ))}
            </View>
          </View>
        )}

        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            onOpen?.();
          }}
          accessibilityRole="button"
          accessibilityLabel="Open subscriptions"
          hitSlop={6}
          style={{
            width: 32,
            height: 32,
            flexShrink: 0,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: hp.border,
            backgroundColor: hp.background,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="chevron-forward" size={16} color={hp.inkSoft} />
        </Pressable>
      </View>
    </Pressable>
  );
}
