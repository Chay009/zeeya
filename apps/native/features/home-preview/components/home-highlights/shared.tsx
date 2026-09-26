import type { ReactNode } from "react";
import { PressableFeedback, Skeleton } from "heroui-native";
import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";
import { useThemeColors } from "@/components/ui/theme";
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

function PairCardHeader({ title }: { title: string }) {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-center justify-between gap-2">
      <Text numberOfLines={1} className="min-w-0 flex-1 text-caption font-semibold text-muted">
        {title}
      </Text>
      <AppIcon name="chevron-right" size={14} color={colors.faint} />
    </View>
  );
}

export function PairCardShell({
  title,
  onPress,
  children,
}: {
  title: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <PressableFeedback
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      className="h-full w-full flex-1 overflow-hidden rounded-card bg-card p-4"
      style={{ minHeight: PAIR_CARD_MIN_HEIGHT }}
    >
      <PressableFeedback.Highlight />
      <PairCardHeader title={title} />
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
        <MoneyText weight="bold" className="text-title tracking-tight text-ink" style={moneyTextStyle}>
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
