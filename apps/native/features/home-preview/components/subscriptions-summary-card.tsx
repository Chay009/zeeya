import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, Pressable, Text, View } from "react-native";

import type { HomePreviewData, PreviewSub } from "../data";
import { hp } from "../theme";
import { BrandLogo } from "./brand-logo";
import { SubscriptionSpendValue } from "./subscription-ui";

const STACK_ICON_SIZE = 38;
const STACK_ICON_STEP = 24;
const STACK_VISIBLE_COUNT = 4;
const SWIPE_DISTANCE = 32;

function SwipeableSubscriptionIcons({
  items,
  selectedIndex,
  onSelect,
}: {
  items: PreviewSub[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const swipeX = useRef(new Animated.Value(0)).current;
  const visibleItems = items.slice(0, Math.min(STACK_VISIBLE_COUNT, items.length));
  const remainingCount = Math.max(0, items.length - visibleItems.length);

  const finishSwipe = useCallback(
    (direction: 1 | -1) => {
      if (items.length < 2) return;
      const nextIndex = (selectedIndex + direction + items.length) % items.length;
      const destination = direction === 1 ? -78 : 78;

      Animated.timing(swipeX, {
        toValue: destination,
        duration: 140,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        onSelect(nextIndex);
        swipeX.setValue(0);
      });
    },
    [items.length, onSelect, selectedIndex, swipeX],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          items.length > 1 &&
          Math.abs(gestureState.dx) > 8 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderMove: (_, gestureState) => {
          swipeX.setValue(gestureState.dx);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx <= -SWIPE_DISTANCE) {
            finishSwipe(1);
          } else if (gestureState.dx >= SWIPE_DISTANCE) {
            finishSwipe(-1);
          } else {
            Animated.spring(swipeX, {
              toValue: 0,
              useNativeDriver: true,
              damping: 18,
              stiffness: 220,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(swipeX, {
            toValue: 0,
            useNativeDriver: true,
            damping: 18,
            stiffness: 220,
          }).start();
        },
      }),
    [finishSwipe, items.length, swipeX],
  );

  useEffect(() => {
    swipeX.setValue(0);
  }, [selectedIndex, swipeX]);

  if (items.length === 0) return null;

  return (
    <View
      {...panResponder.panHandlers}
      accessibilityLabel="Swipe subscription brands to change the selected subscription"
      style={{
        width:
          STACK_ICON_SIZE + STACK_ICON_STEP * (visibleItems.length - 1) + (remainingCount ? 30 : 0),
        height: 48,
        justifyContent: "center",
      }}
    >
      {visibleItems.map((_, stackIndex) => {
        const itemIndex = (selectedIndex + stackIndex) % items.length;
        const item = items[itemIndex]!;
        const isSelected = stackIndex === 0;

        return (
          <Animated.View
            key={`${item.key}-${stackIndex}`}
            style={{
              position: "absolute",
              left: stackIndex * STACK_ICON_STEP,
              zIndex: visibleItems.length - stackIndex,
              transform: isSelected ? [{ translateX: swipeX }] : undefined,
              opacity: isSelected ? 1 : 0.92,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Select ${item.name} subscription`}
              onPress={() => onSelect(itemIndex)}
              style={{
                width: STACK_ICON_SIZE + 4,
                height: STACK_ICON_SIZE + 4,
                borderRadius: (STACK_ICON_SIZE + 4) / 2,
                borderWidth: isSelected ? 2 : 1,
                borderColor: isSelected ? hp.emerald : hp.background,
                backgroundColor: hp.background,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <BrandLogo
                letter={item.letter}
                tile={item.tile}
                ink={item.ink}
                img={item.img}
                size={STACK_ICON_SIZE}
                radius={STACK_ICON_SIZE / 2}
                iconRatio={0.7}
              />
            </Pressable>
          </Animated.View>
        );
      })}

      {remainingCount > 0 && (
        <View
          style={{
            position: "absolute",
            right: 0,
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: hp.chipBg,
            borderWidth: 1,
            borderColor: hp.border,
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: "800", color: hp.emeraldDeep }}>
            +{remainingCount}
          </Text>
        </View>
      )}
    </View>
  );
}

export function SubscriptionsSummaryCard({
  onOpen,
  subscriptions,
}: {
  onOpen?: () => void;
  subscriptions: HomePreviewData["subscriptions"];
}) {
  const [selectedKey, setSelectedKey] = useState("");
  const items = subscriptions.items;
  const selectedItem = items.find((item) => item.key === selectedKey) ?? items[0];
  const selectedIndex = selectedItem ? items.indexOf(selectedItem) : 0;

  const selectIndex = useCallback(
    (index: number) => setSelectedKey(items[index]?.key ?? ""),
    [items],
  );

  useEffect(() => {
    if (!items.some((item) => item.key === selectedKey)) setSelectedKey(items[0]?.key ?? "");
  }, [items, selectedKey]);

  return (
    <View
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1.8, color: hp.muted }}>
              SUBSCRIPTIONS
            </Text>
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: hp.emerald }} />
          </View>
          <Text
            style={{
              marginTop: 6,
              fontSize: 14,
              fontWeight: "800",
              color: hp.ink,
            }}
          >
            {items.length} {items.length === 1 ? "Subscription" : "Subscriptions"}
          </Text>
          {items.length > 0 ? (
            <SubscriptionSpendValue value={subscriptions.monthlySpend} size={28} />
          ) : (
            <Text style={{ marginTop: 8, fontSize: 12, color: hp.muted }}>
              No subscriptions detected
            </Text>
          )}
        </View>

        {items.length > 0 && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <SwipeableSubscriptionIcons
              items={items}
              selectedIndex={selectedIndex}
              onSelect={selectIndex}
            />
            <Pressable
              onPress={onOpen}
              accessibilityRole="button"
              accessibilityLabel="Open all subscriptions"
              hitSlop={6}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: hp.border,
                backgroundColor: hp.background,
              }}
            >
              <Ionicons name="chevron-forward" size={14} color={hp.emeraldDeep} />
            </Pressable>
          </View>
        )}
      </View>

      {selectedItem && (
        <View
          style={{
            marginTop: 3,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{ fontSize: 11, fontWeight: "700", color: hp.emeraldDeep }}
            >
              {selectedItem.name}
              <Text style={{ fontWeight: "500", color: hp.muted }}>
                {" · "}
                {selectedItem.typeLabel} · {selectedItem.dateLabel}
              </Text>
            </Text>
          </View>
          <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "800", color: hp.ink }}>
            {selectedItem.amount}
          </Text>
        </View>
      )}
    </View>
  );
}
