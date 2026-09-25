import { Surface } from "heroui-native";
import { Pressable, View } from "react-native";
import { Circle, Defs, LinearGradient, Stop, Svg } from "react-native-svg";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";
import { moneyFontFamily } from "@/lib/fonts";

import { useHomePalette } from "../theme";

const SIZE = 72;
const R = 30;
const CIRC = 2 * Math.PI * R;

export function BudgetCard({
  monthLabel,
  spent,
  limit,
  usedPercent,
  remaining,
  onOpen,
}: {
  monthLabel: string;
  spent: string;
  limit: string | null;
  usedPercent: number | null;
  remaining: string | null;
  onOpen?: () => void;
}) {
  const hp = useHomePalette();
  const hasBudget = limit !== null && usedPercent !== null;

  return (
    <Surface asChild className="rounded-card bg-hero-surface p-5">
      <View>
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-bold tracking-tight text-on-ink">Monthly budget</Text>
          {onOpen ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open budget in Insights"
              onPress={onOpen}
              hitSlop={8}
            >
              <AppIcon name="chevron-right" size={16} color={hp.faint} />
            </Pressable>
          ) : (
            <AppIcon name="chevron-right" size={16} color={hp.faint} />
          )}
        </View>

        <View className="mt-4" style={{ width: SIZE, height: SIZE }}>
          <Svg
            viewBox="0 0 72 72"
            className="h-full w-full"
            style={{ transform: [{ rotate: "-90deg" }] }}
          >
            <Defs>
              <LinearGradient id="budgetArc" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={hp.accent} />
                <Stop offset="1" stopColor={hp.accentDeep} />
              </LinearGradient>
            </Defs>
            <Circle cx="36" cy="36" r={R} fill="none" stroke={hp.track} strokeWidth="10" />
            <Circle
              cx="36"
              cy="36"
              r={R}
              fill="none"
              stroke="url(#budgetArc)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${hasBudget ? (CIRC * usedPercent) / 100 : 0} ${CIRC}`}
            />
          </Svg>
          <View className="absolute inset-0 items-center justify-center">
            {hasBudget ? (
              <Text
                className="text-[18px] tracking-tight text-on-ink"
                style={{ fontFamily: moneyFontFamily("semibold") }}
              >
                {usedPercent}%
              </Text>
            ) : (
              <AppIcon name="info" size={18} color={hp.accent} />
            )}
          </View>
        </View>

        <View className="mt-3 min-w-0">
          {limit ? (
            <Text
              numberOfLines={1}
              className="text-[19px] tracking-tight text-on-ink"
              style={{ fontFamily: moneyFontFamily("semibold") }}
            >
              {spent}
            </Text>
          ) : (
            <Text
              className="text-[17px] text-on-ink"
              style={{ fontFamily: moneyFontFamily("semibold") }}
            >
              No budget set
            </Text>
          )}
          {limit ? (
            <Text numberOfLines={1} className="mt-0.5 text-caption text-muted-soft">
              of {limit}
            </Text>
          ) : null}
        </View>

        <View className="mt-3 flex-row items-center gap-1.5 self-start rounded-pill bg-white/10 px-2.5 py-1.5">
          <AppIcon name={hasBudget ? "trend-up" : "info"} size={13} color={hp.positive} />
          <Text numberOfLines={1} className="text-label font-bold text-positive">
            {hasBudget ? remaining ? `${remaining} left` : "On track" : "Set a limit"}
          </Text>
        </View>
      </View>
    </Surface>
  );
}
