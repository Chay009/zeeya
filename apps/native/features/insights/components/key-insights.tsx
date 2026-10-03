import { PressableFeedback } from "heroui-native";
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon, type AppIconName } from "@/components/icon";
import { useCardElevation } from "@/components/ui/elevation";
import { useThemeColors, withAlpha } from "@/components/ui/theme";
import { moneyFontFamily } from "@/lib/fonts";

// "Key insights": one swipeable row of small tiles, each one fact the app
// knows about the month — top category, subscriptions a month, top vendor,
// biggest day, daily average, cashback, funds, top place. A tile renders
// only when its data exists; a tile with detail opens its sheet.

export interface KeyInsight {
  key: string;
  label: string;
  value: string;
  /** A second line under the value ("on 2 Oct", "3 active"). */
  detail?: string;
  /** A ready leading visual (category tile, brand logo); else `icon`. */
  leading?: ReactNode;
  icon?: AppIconName;
  /** The icon's hue; the tile tints its circle with it. */
  hue?: string;
  /** Money values use the money face. */
  money?: boolean;
  onPress?: () => void;
}

const TILE_WIDTH = 136;

function InsightTile({ item }: { item: KeyInsight }) {
  const colors = useThemeColors();
  const elevation = useCardElevation();
  const hue = item.hue ?? colors.accentDeep;
  return (
    <PressableFeedback
      accessibilityRole={item.onPress ? "button" : undefined}
      accessibilityLabel={`${item.label}, ${item.value}${item.detail ? `, ${item.detail}` : ""}`}
      onPress={item.onPress}
      isDisabled={!item.onPress}
      className="rounded-[20px] bg-card p-3.5"
      style={[{ width: TILE_WIDTH, borderCurve: "continuous" }, elevation]}
    >
      {item.leading ?? (
        <View
          className="h-8 w-8 items-center justify-center rounded-full"
          style={{ backgroundColor: withAlpha(hue, 0.14) }}
        >
          <AppIcon name={item.icon ?? "sparkles"} size={16} color={hue} />
        </View>
      )}
      <Text numberOfLines={1} className="mt-3 text-meta text-muted">
        {item.label}
      </Text>
      <Text
        numberOfLines={1}
        className="text-ink"
        style={
          item.money
            ? {
                fontFamily: moneyFontFamily("semibold"),
                fontSize: 17,
                lineHeight: 22,
                letterSpacing: -0.3,
              }
            : { fontSize: 16, lineHeight: 21, fontWeight: "700" }
        }
      >
        {item.value}
      </Text>
      {item.detail ? (
        <Text numberOfLines={1} className="text-meta text-muted">
          {item.detail}
        </Text>
      ) : null}
    </PressableFeedback>
  );
}

export function KeyInsightsRow({ items }: { items: readonly KeyInsight[] }) {
  if (items.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="-mx-4"
      // Room for the tiles' soft shadows.
      contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingTop: 2, paddingBottom: 10 }}
    >
      {items.map((item) => (
        <InsightTile key={item.key} item={item} />
      ))}
    </ScrollView>
  );
}
