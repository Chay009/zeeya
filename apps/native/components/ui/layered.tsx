import { PressableFeedback } from "heroui-native";
import type { ComponentProps, ReactNode } from "react";
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon, type AppIconName } from "@/components/icon";

import { useThemeColors, withAlpha } from "./theme";

// The layered page: white sheets resting on a near-black base, with a band of
// dark pill chips between them — depth from layering, not from more cards.
//
//   ┌ TopSheet ──────────┐   rounded bottom; the screen's number + chart
//   └────────────────────┘
//     ChipBand              dark strip of shortcut chips (Categories · …)
//   ┌ BottomSheet ───────┐   rounded top + grab handle; lists and detail
//
// LayeredScroll paints the base so the band sits on it and the bottom sheet
// fills down to the end of the page.

export const SHEET_RADIUS = 28;

export function LayeredScroll({
  children,
  refreshControl,
  bottomPadding,
}: {
  children: ReactNode;
  refreshControl?: ComponentProps<typeof ScrollView>["refreshControl"];
  /** Clearance for the floating tab bar. */
  bottomPadding: number;
}) {
  const colors = useThemeColors();
  return (
    <View className="flex-1" style={{ backgroundColor: colors.card }}>
      <ScrollView
        className="flex-1"
        // The base must sit BELOW the sheets: in dark mode the hero token is a
        // step lighter than cards, so the page background is used instead.
        style={{ backgroundColor: colors.isDark ? colors.background : colors.hero }}
        refreshControl={refreshControl}
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        {children}
        {/* The last sheet's colour continues under the tab bar. */}
        <View style={{ height: bottomPadding, backgroundColor: colors.card }} />
      </ScrollView>
    </View>
  );
}

export function TopSheet({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useThemeColors();
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderBottomLeftRadius: SHEET_RADIUS,
          borderBottomRightRadius: SHEET_RADIUS,
          borderCurve: "continuous",
          overflow: "hidden",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function BottomSheet({ children, grow = true }: { children: ReactNode; grow?: boolean }) {
  const colors = useThemeColors();
  return (
    <View
      style={{
        flexGrow: grow ? 1 : 0,
        backgroundColor: colors.card,
        borderTopLeftRadius: SHEET_RADIUS,
        borderTopRightRadius: SHEET_RADIUS,
        borderCurve: "continuous",
      }}
    >
      {/* A grab handle: it reads as a sheet you could pull, the layer's cue. */}
      <View className="items-center pb-1 pt-2.5">
        <View className="h-1 w-9 rounded-pill" style={{ backgroundColor: colors.fillStrong }} />
      </View>
      {children}
    </View>
  );
}

export interface BandChip {
  key: string;
  label: string;
  icon: AppIconName;
  onPress: () => void;
}

/** The dark strip between sheets: shortcut pills, icon + label. */
export function ChipBand({ chips }: { chips: readonly BandChip[] }) {
  const colors = useThemeColors();
  if (chips.length === 0) return <View style={{ height: 14 }} />;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 14 }}
    >
      {chips.map((chip) => (
        <PressableFeedback
          key={chip.key}
          accessibilityRole="button"
          accessibilityLabel={chip.label}
          onPress={chip.onPress}
          className="flex-row items-center gap-2 rounded-pill py-2 pl-2 pr-4"
          style={{
            backgroundColor: withAlpha(colors.onHero, 0.07),
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: withAlpha(colors.onHero, 0.16),
          }}
        >
          <View
            className="h-7 w-7 items-center justify-center rounded-full"
            style={{ backgroundColor: withAlpha(colors.onHero, 0.12) }}
          >
            <AppIcon name={chip.icon} size={15} color={colors.onHero} />
          </View>
          <Text className="text-caption font-medium" style={{ color: colors.onHero }}>
            {chip.label}
          </Text>
        </PressableFeedback>
      ))}
    </ScrollView>
  );
}

/**
 * A link row inside a sheet ("Category review ›"): no box of its own — the
 * sheet is the surface; a hairline above separates it when asked.
 */
export function SheetLinkCard({
  icon,
  title,
  detail,
  onPress,
  divider = false,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  onPress: () => void;
  divider?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <PressableFeedback
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${detail}`}
      onPress={onPress}
      className="min-h-14 flex-row items-center gap-3 py-2.5"
      style={divider ? { borderTopWidth: 1, borderTopColor: colors.divider } : undefined}
    >
      {icon}
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-body font-medium text-ink">
          {title}
        </Text>
        <Text numberOfLines={1} className="text-caption text-muted">
          {detail}
        </Text>
      </View>
      <AppIcon name="chevron-right" size={16} color={colors.muted} />
    </PressableFeedback>
  );
}
