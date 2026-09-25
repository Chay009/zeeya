import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { MoneyText } from "@/components/native-ui/money-text";
import { formatMoney } from "@/features/dashboard/utils/format";
import { fromMinorUnits } from "@/lib/currency";
import { moneyTextStyle } from "@/lib/fonts";

import { BrandLogo } from "../brand-logo";

export const PAIR_CARD_MIN_HEIGHT = 168;
export const PAIR_LOGO_SIZE = 34;
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
  return <View className="rounded-full bg-track" style={{ width, height }} />;
}

function PairCardHeader({ title }: { title: string }) {
  return (
    <View className="flex-row items-center justify-between gap-2">
      <Text numberOfLines={1} className="min-w-0 flex-1 text-[15px] font-semibold text-ink">
        {title}
      </Text>
      <Text className="text-[16px] leading-4 text-faint">›</Text>
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      className="h-full w-full flex-1 rounded-card bg-card p-4"
      style={{ minHeight: PAIR_CARD_MIN_HEIGHT }}
    >
      <PairCardHeader title={title} />
      {children}
    </Pressable>
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
    <View className="mt-3 flex-row items-baseline gap-1.5">
      <MoneyText
        weight="bold"
        className="text-ink"
        style={{
          fontSize: PAIR_SUMMARY_COUNT_SIZE,
          lineHeight: PAIR_SUMMARY_COUNT_SIZE + 2,
          ...moneyTextStyle,
        }}
      >
        {count}
      </MoneyText>
      <Text className="text-caption text-muted">
        {label} · {totalLabel}
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
  faded = false,
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
    <View
      className="flex-row items-center gap-2.5"
      style={faded ? { opacity: 0.88 } : undefined}
    >
      <BrandLogo
        letter={letter}
        tile={tile}
        ink={ink}
        img={img}
        size={PAIR_LOGO_SIZE}
        radius={PAIR_LOGO_SIZE / 2}
        iconRatio={0.62}
      />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-body font-semibold text-ink">
          {name}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} className="mt-0.5 text-label text-muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <MoneyText numberOfLines={1} weight="semibold" className="shrink-0 text-body font-semibold text-ink">
        {amountLabel}
      </MoneyText>
    </View>
  );
}

export function PairOverflowHint({ count }: { count: number }) {
  if (count <= 0) return null;
  return <Text className="text-label font-semibold text-accent-deep">+{count} more</Text>;
}
