import type { ReactNode } from "react";
import { PressableFeedback, Skeleton } from "heroui-native";
import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { Art, hasArt } from "@/components/art/art";
import { AppIcon } from "@/components/icon";
import { useCardElevation } from "@/components/ui/elevation";
import { mixColors, useThemeColors } from "@/components/ui/theme";
import { MoneyText } from "@/components/native-ui/money-text";
import { formatMoney } from "@/features/dashboard/utils/format";
import { fromMinorUnits } from "@/lib/currency";
import { moneyTextStyle } from "@/lib/fonts";

import { BrandLogo } from "../brand-logo";

export const PAIR_CARD_MIN_HEIGHT = 176;
export const PAIR_LOGO_SIZE = 28;
export const PAIR_VISIBLE_COUNT = 2;
export const PAIR_SUMMARY_COUNT_SIZE = 30;

export function amount(value: number, currency: string): string {
  return formatMoney(fromMinorUnits(value, currency), currency);
}

export function signedNet(value: number, currency: string): string {
  const formatted = amount(Math.abs(value), currency);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

export function relativeDueLabel(ms: number): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(ms);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  if (diff <= 0) return "today";
  if (diff === 1) return "tomorrow";
  return `in ${diff} days`;
}

export function GhostLine({ width, height = 10 }: { width: number; height?: number }) {
  return <Skeleton className="rounded-sm" style={{ width, height }} />;
}

function PairCardHeader({ title, chevron }: { title: string; chevron: boolean }) {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-center justify-between gap-2">
      <Text numberOfLines={1} className="min-w-0 flex-1 text-caption font-semibold text-muted">
        {title}
      </Text>
      {chevron ? <AppIcon name="chevron-right" size={14} color={colors.faint} /> : null}
    </View>
  );
}

// A pair card can carry its section's art in the top-right corner (where the
// chevron would be — the whole card stays the button) on a faint field of
// its own hue, so the two cards read as two things, not two white boxes.
const PAIR_ART_SIZE = 52;

export function PairCardShell({
  title,
  onPress,
  art,
  hue,
  children,
}: {
  title: string;
  onPress: () => void;
  /** A catalog art piece for the corner (assets/art); none keeps the chevron. */
  art?: string;
  /** The card's own hue, laid very faintly over the card colour. */
  hue?: string;
  children: ReactNode;
}) {
  const colors = useThemeColors();
  const elevation = useCardElevation();
  const withArt = art !== undefined && hasArt(art);
  return (
    <PressableFeedback
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      className="h-full w-full flex-1 overflow-hidden rounded-card p-5"
      style={[
        {
          minHeight: PAIR_CARD_MIN_HEIGHT,
          backgroundColor: hue
            ? mixColors(colors.card, hue, colors.isDark ? 0.1 : 0.06)
            : colors.card,
        },
        elevation,
      ]}
    >
      <PressableFeedback.Highlight />
      {withArt ? (
        <View pointerEvents="none" style={{ position: "absolute", top: 8, right: 8 }}>
          <Art name={art} size={PAIR_ART_SIZE} />
        </View>
      ) : null}
      <View style={{ marginRight: withArt ? PAIR_ART_SIZE - 8 : 0 }}>
        <PairCardHeader title={title} chevron={!withArt} />
      </View>
      {children}
    </PressableFeedback>
  );
}

export function PairSummaryHero({
  count,
  label,
  totalLabel,
}: {
  count: number;
  label: string;
  totalLabel: string;
}) {
  return (
    <View className="mt-2">
      <View className="flex-row items-baseline gap-1.5">
        <MoneyText
          weight="semibold"
          className="text-ink"
          style={{ ...moneyTextStyle, fontSize: 20, lineHeight: 26, letterSpacing: -0.4 }}
        >
          {count}
        </MoneyText>
        <Text className="text-caption text-muted">{label}</Text>
      </View>
      <Text numberOfLines={1} className="text-caption font-medium text-ink-soft">
        {totalLabel}
      </Text>
    </View>
  );
}

export function PairMerchantRow({
  letter,
  tile,
  ink,
  img,
  name,
  subtitle,
  amountLabel,
}: {
  letter: string;
  tile: string;
  ink: string;
  img?: string;
  name: string;
  subtitle?: string;
  amountLabel: string;
  faded?: boolean;
}) {
  return (
    <View className="flex-row items-center gap-2.5">
      <BrandLogo
        letter={letter}
        tile={tile}
        ink={ink}
        img={img}
        size={PAIR_LOGO_SIZE}
        radius={PAIR_LOGO_SIZE / 2}
        iconRatio={0.6}
      />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-meta font-semibold text-ink">
          {name}
        </Text>
        <Text numberOfLines={1} className="text-label text-muted">
          {subtitle ? `${amountLabel} · ${subtitle}` : amountLabel}
        </Text>
      </View>
    </View>
  );
}

export function PairOverflowHint({ count }: { count: number }) {
  if (count <= 0) return null;
  return <Text className="text-meta font-medium text-muted">+{count} more</Text>;
}
