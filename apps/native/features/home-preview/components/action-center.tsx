import { PressableFeedback } from "heroui-native";
import { ScrollView, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon, type AppIconName } from "@/components/icon";
import { useCardElevation } from "@/components/ui/elevation";
import { moneyLabel } from "@/components/ui/money";
import { useThemeColors } from "@/components/ui/theme";
import type { ActionItem, ActionTone } from "@/lib/action-center";
import { moneyFontFamily } from "@/lib/fonts";

// Home's Action Center, under the balance: only what needs attention now
// (see lib/action-center). Renders nothing on a quiet day — no empty state,
// so it never becomes furniture the eye learns to skip.

const KIND_ICON: Record<ActionItem["kind"], AppIconName> = {
  bill: "receipt",
  trip: "airplane",
  delivery: "bag",
  card: "card",
  data: "pulse",
};

const ITEM_WIDTH = 252;

function toneColor(tone: ActionTone, colors: ReturnType<typeof useThemeColors>): string {
  if (tone === "critical") return colors.negative;
  if (tone === "warning") return colors.warning;
  return colors.accentDeep;
}

function ActionCard({
  item,
  currency,
  width,
  onPress,
}: {
  item: ActionItem;
  currency: string;
  width: number | "100%";
  onPress?: () => void;
}) {
  const colors = useThemeColors();
  const elevation = useCardElevation();
  const color = toneColor(item.tone, colors);
  // One calm card for every item; the tone lives in a small status dot on the
  // icon (and red detail text when overdue), not in a coloured wash.
  return (
    <PressableFeedback
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${item.title}, ${item.detail}${item.amount !== null ? `, ${moneyLabel(item.amount, currency)}` : ""}`}
      onPress={onPress}
      isDisabled={!onPress}
      className="flex-row items-center gap-3 rounded-card bg-card p-3.5"
      style={[{ width, borderCurve: "continuous" }, elevation]}
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-xl"
        style={{ backgroundColor: colors.fill, borderCurve: "continuous" }}
      >
        <AppIcon name={KIND_ICON[item.kind]} size={18} color={colors.ink} />
        {item.tone !== "info" ? (
          <View
            className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color, borderWidth: 2, borderColor: colors.fill }}
          />
        ) : null}
      </View>
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <Text numberOfLines={1} className="min-w-0 flex-1 text-body font-semibold text-ink">
            {item.title}
          </Text>
          {item.amount !== null ? (
            <Text
              numberOfLines={1}
              className="text-ink"
              style={{
                fontFamily: moneyFontFamily("semibold"),
                fontSize: 15,
                lineHeight: 20,
                letterSpacing: -0.2,
              }}
            >
              {moneyLabel(item.amount, currency)}
            </Text>
          ) : null}
        </View>
        <Text
          numberOfLines={1}
          className="text-meta font-medium"
          style={{ color: item.tone === "critical" ? colors.negative : colors.muted }}
        >
          {item.detail}
        </Text>
      </View>
    </PressableFeedback>
  );
}

export function ActionCenter({
  items,
  currency,
  onOpenBills,
}: {
  items: readonly ActionItem[];
  currency: string;
  onOpenBills: () => void;
}) {
  if (items.length === 0) return null;
  const pressFor = (item: ActionItem) => (item.kind === "bill" ? onOpenBills : undefined);
  if (items.length === 1) {
    const item = items[0]!;
    return (
      <View className="mt-4">
        <ActionCard item={item} currency={currency} width="100%" onPress={pressFor(item)} />
      </View>
    );
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="-mx-4 mt-4"
      // Room for the info cards' soft shadows.
      contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingBottom: 8, paddingTop: 2 }}
      accessibilityLabel={`${items.length} things need attention`}
    >
      {items.map((item) => (
        <ActionCard
          key={item.key}
          item={item}
          currency={currency}
          width={ITEM_WIDTH}
          onPress={pressFor(item)}
        />
      ))}
    </ScrollView>
  );
}
