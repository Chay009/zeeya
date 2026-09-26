import type { ComponentProps } from "react";
import { Pressable, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";

import { useThemeColors } from "@/components/ui/theme";

export type InsightsBudget = {
  monthLabel: string;
  spent: string;
  limit: string | null;
  usedPercent: number | null;
  remaining: string | null;
};

function InsightsRow({
  icon,
  tile,
  ink,
  title,
  subtitle,
  onPress,
  isFirst,
}: {
  icon: ComponentProps<typeof AppIcon>["name"];
  tile: string;
  ink: string;
  title: string;
  subtitle: string;
  onPress?: () => void;
  isFirst: boolean;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={title}
      onPress={onPress}
      disabled={!onPress}
      className={`flex-row items-center gap-3 py-3 ${isFirst ? "" : "border-t border-border"}`}
    >
      <View
        className="h-11 w-11 shrink-0 items-center justify-center rounded-[14px]"
        style={{ backgroundColor: tile }}
      >
        <AppIcon name={icon} size={22} color={ink} />
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-subtitle font-semibold text-ink">
          {title}
        </Text>
        <Text numberOfLines={1} className="mt-0.5 text-caption text-muted">
          {subtitle}
        </Text>
      </View>
      {onPress ? <AppIcon name="chevron-right" size={16} color={colors.faint} /> : null}
    </Pressable>
  );
}

export function InsightsCard({ budget }: { budget: InsightsBudget }) {
  const colors = useThemeColors();
  const hasBudget = budget.limit !== null && budget.usedPercent !== null;

  const rows: Array<{
    key: string;
    icon: ComponentProps<typeof AppIcon>["name"];
    title: string;
    subtitle: string;
  }> = [];

  if (hasBudget) {
    rows.push({
      key: "budget",
      icon: "trend-up",
      title: `${budget.usedPercent}% of monthly budget used`,
      subtitle: `${budget.spent} of ${budget.limit} · ${budget.remaining ?? "on track"}`,
    });
  }

  if (rows.length === 0) return null;

  return (
    <View className="mt-3 rounded-card bg-card px-5 py-2">
      <Text className="pt-3 text-[17px] font-semibold text-ink">Insights</Text>
      <View>
        {rows.map((row, index) => (
          <InsightsRow
            key={row.key}
            icon={row.icon}
            tile={colors.accentSoft}
            ink={colors.accent}
            title={row.title}
            subtitle={row.subtitle}
            isFirst={index === 0}
          />
        ))}
      </View>
    </View>
  );
}
