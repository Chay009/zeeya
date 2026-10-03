import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";
import { useThemeColors, withAlpha } from "@/components/ui/theme";

import { merchantLogo } from "./analytics-overview";

// Small visuals that turn a KPI from a line of text into something read at a
// glance (the reference's dashboard style): a tick-segment share bar, mini
// day bars with one lit, a delta pill, a stack of brand logos. One accent
// (lime) on neutral greys; each is sized for a half-width grid cell.

/** A row of thin rounded ticks, `fraction` of them lit — "29% of spending". */
export function TickBar({ fraction, ticks = 22 }: { fraction: number; ticks?: number }) {
  const colors = useThemeColors();
  const lit = Math.round(Math.max(0, Math.min(1, fraction)) * ticks);
  return (
    <View className="flex-row items-center gap-[2px]" style={{ height: 14 }}>
      {Array.from({ length: ticks }, (_, index) => (
        <View
          key={index}
          className="flex-1 rounded-full"
          style={{
            height: 14,
            backgroundColor: index < lit ? colors.accentDeep : colors.fillStrong,
          }}
        />
      ))}
    </View>
  );
}

/** Mini column bars, one lit (the biggest day among the month's days). */
export function MiniBars({ values, litIndex }: { values: readonly number[]; litIndex: number }) {
  const colors = useThemeColors();
  const max = Math.max(1, ...values);
  return (
    <View className="flex-row items-end gap-[2px]" style={{ height: 22 }}>
      {values.map((value, index) => (
        <View
          key={index}
          className="flex-1 rounded-[2px]"
          style={{
            height: Math.max(2, (value / max) * 22),
            backgroundColor:
              index === litIndex ? colors.accentDeep : withAlpha(colors.accentDeep, 0.22),
          }}
        />
      ))}
    </View>
  );
}

/** "↑ 12% vs last month" as a small soft pill; `goodWhen` sets its colour. */
export function DeltaPill({
  percent,
  goodWhen,
  suffix = "vs last month",
}: {
  percent: number | null;
  goodWhen: "up" | "down";
  suffix?: string;
}) {
  const colors = useThemeColors();
  if (percent === null || !Number.isFinite(percent)) {
    return <Text className="text-meta text-muted">No baseline yet</Text>;
  }
  const rounded = Math.round(Math.abs(percent));
  if (rounded === 0) return <Text className="text-meta text-muted">Same as last month</Text>;
  const up = percent > 0;
  const good = up === (goodWhen === "up");
  const tone = good ? colors.positive : colors.negative;
  return (
    <View className="flex-row items-center gap-1.5">
      <View
        className="flex-row items-center gap-0.5 rounded-pill px-1.5 py-0.5"
        style={{ backgroundColor: withAlpha(tone, 0.12) }}
      >
        <AppIcon name={up ? "trend-up" : "trend-down"} size={11} color={tone} />
        <Text className="text-meta font-semibold" style={{ color: tone }}>
          {rounded}%
        </Text>
      </View>
      <Text numberOfLines={1} className="min-w-0 shrink text-meta text-muted">
        {suffix}
      </Text>
    </View>
  );
}

/** Up to four brand logos, overlapping — "these are your subscriptions". */
export function LogoStack({ names, more }: { names: readonly string[]; more: number }) {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-center">
      {names.slice(0, 4).map((name, index) => (
        <View
          key={name}
          className="rounded-[9px]"
          style={{
            marginLeft: index === 0 ? 0 : -6,
            borderWidth: 2,
            borderColor: colors.card,
            borderRadius: 9,
          }}
        >
          {merchantLogo(name, 22)}
        </View>
      ))}
      {more > 0 ? <Text className="ml-1.5 text-meta font-medium text-muted">+{more}</Text> : null}
    </View>
  );
}
