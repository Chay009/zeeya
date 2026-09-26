import { Select, Tabs } from "heroui-native";
import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";
import { useThemeColors } from "@/components/ui/theme";

import type { AnalyticsTab } from "../analytics-scope";
export function AnalyticsFilterSelect({
  icon,
  label,
  accessibilityLabel,
  value,
  options,
  onChange,
  compact = false,
}: {
  icon: "calendar" | "rupee-receipt";
  label: string;
  accessibilityLabel: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  const colors = useThemeColors();
  const selected = options.find((option) => option.value === value) ?? options[0]!;

  return (
    <Select
      className={compact ? "" : "min-w-0 flex-1"}
      value={selected}
      onValueChange={(next) => {
        if (!Array.isArray(next) && next?.value) onChange(next.value);
      }}
      presentation="popover"
    >
      <Select.Trigger
        variant="unstyled"
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        className={
          compact
            ? "min-h-9 flex-row items-center gap-1.5 rounded-pill bg-card px-3"
            : "min-h-12 w-full flex-row items-center justify-between rounded-pill bg-fill px-4"
        }
      >
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <AppIcon name={icon} size={15} color={colors.muted} />
          <Text numberOfLines={1} className="text-caption font-bold text-ink">
            {label}
          </Text>
        </View>
        <Select.TriggerIndicator iconProps={{ color: colors.muted, size: 14 }} />
      </Select.Trigger>
      <Select.Portal>
        <Select.Overlay />
        <Select.Content presentation="popover" className="min-w-[180px]">
          {options.map((option) => (
            <Select.Item key={option.value} value={option.value} label={option.label}>
              <Select.ItemLabel numberOfLines={1} />
              <Select.ItemIndicator />
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Portal>
    </Select>
  );
}

export function AnalyticsControls({
  tab,
  onTabChange,
  showBudget,
}: {
  tab: AnalyticsTab;
  onTabChange(value: AnalyticsTab): void;
  showBudget: boolean;
}) {
  const tabs: readonly [AnalyticsTab, string][] = showBudget
    ? [
        ["income", "Income"],
        ["outcome", "Outcome"],
        ["budget", "Budget"],
      ]
    : [
        ["income", "Income"],
        ["outcome", "Outcome"],
      ];

  return (
    <Tabs value={tab} onValueChange={(next) => onTabChange(next as AnalyticsTab)}>
        <Tabs.List className="rounded-pill bg-card p-1">
          <Tabs.Indicator className="rounded-pill bg-accent" />
          {tabs.map(([value, label]) => (
            <Tabs.Trigger key={value} value={value} className="min-h-11 flex-1 py-3">
              <Tabs.Label
                className={`text-[13px] font-bold ${tab === value ? "text-on-accent" : "text-ink-soft"}`}
              >
                {label}
              </Tabs.Label>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs>
  );
}
