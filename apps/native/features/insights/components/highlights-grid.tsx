import { PressableFeedback } from "heroui-native";
import type { ReactNode } from "react";
import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { ProgressRing } from "@/components/charts/progress-ring";
import { AppIcon } from "@/components/icon";
import { useThemeColors } from "@/components/ui/theme";

// The month's highlights as KPI cells in one bordered card (two columns): a
// small grey label, the value, then a small visual that makes the number
// readable at a glance (a tick bar, mini bars, a delta pill, logos). Hairline
// rules between cells, no icons or colour beyond the visuals' one accent.
// A cell with more behind it shows a chevron and opens its sheet.

export interface Highlight {
  key: string;
  label: string;
  value: string;
  /** A leading mark beside the value (a brand logo). */
  leading?: ReactNode;
  /** The KPI's picture, under the value. */
  visual?: ReactNode;
  /** A share KPI: a ring with the % beside the text (instead of a bar). */
  ring?: { fraction: number; color: string };
  detail?: string;
  onPress?: () => void;
}

function Cell({ item, column, row }: { item: Highlight; column: 0 | 1; row: number }) {
  const colors = useThemeColors();
  const frame = {
    paddingLeft: column === 1 ? 14 : 0,
    paddingRight: column === 0 ? 14 : 0,
    borderLeftWidth: column === 1 ? 1 : 0,
    borderTopWidth: row > 0 ? 1 : 0,
    borderColor: colors.divider,
  };
  if (item.ring) {
    return (
      <PressableFeedback
        accessibilityRole={item.onPress ? "button" : undefined}
        accessibilityLabel={`${item.label}, ${item.value}${item.detail ? `, ${item.detail}` : ""}`}
        onPress={item.onPress}
        isDisabled={!item.onPress}
        className="w-1/2 flex-row items-center gap-2.5 py-3.5"
        style={frame}
      >
        <ProgressRing fraction={item.ring.fraction} color={item.ring.color} size={46} showPercent />
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-caption text-muted">
            {item.label}
          </Text>
          <Text numberOfLines={1} className="text-body font-semibold text-ink">
            {item.value}
          </Text>
          {item.detail ? (
            <Text numberOfLines={1} className="text-meta text-muted">
              {item.detail}
            </Text>
          ) : null}
        </View>
      </PressableFeedback>
    );
  }
  return (
    <PressableFeedback
      accessibilityRole={item.onPress ? "button" : undefined}
      accessibilityLabel={`${item.label}, ${item.value}${item.detail ? `, ${item.detail}` : ""}`}
      onPress={item.onPress}
      isDisabled={!item.onPress}
      className="w-1/2 py-3.5"
      style={frame}
    >
      <View className="flex-row items-center justify-between gap-1">
        <Text numberOfLines={1} className="min-w-0 shrink text-caption text-muted">
          {item.label}
        </Text>
        {item.onPress ? <AppIcon name="chevron-right" size={13} color={colors.faint} /> : null}
      </View>
      <View className="mt-1 flex-row items-center gap-2">
        {item.leading}
        <Text numberOfLines={1} className="min-w-0 shrink text-subtitle font-medium text-ink">
          {item.value}
        </Text>
      </View>
      {item.visual ? <View className="mt-2.5">{item.visual}</View> : null}
      {item.detail ? (
        <Text numberOfLines={1} className="mt-1.5 text-meta text-muted">
          {item.detail}
        </Text>
      ) : null}
    </PressableFeedback>
  );
}

export function HighlightsGrid({ items }: { items: readonly Highlight[] }) {
  if (items.length === 0) return null;
  // Inside its card: hairlines between cells only.
  return (
    <View className="flex-row flex-wrap">
      {items.map((item, index) => (
        <Cell
          key={item.key}
          item={item}
          column={(index % 2) as 0 | 1}
          row={Math.floor(index / 2)}
        />
      ))}
    </View>
  );
}
