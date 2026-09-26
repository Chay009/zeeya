import { Tabs } from "heroui-native";

import { useThemeColors } from "@/components/ui/theme";

import type { AnalyticsTab } from "../analytics-scope";

export function AnalyticsDirectionTabs({
  value,
  onChange,
  showBudget,
}: {
  value: AnalyticsTab;
  onChange(value: AnalyticsTab): void;
  showBudget: boolean;
}) {
  const colors = useThemeColors();
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
    <Tabs value={value} onValueChange={(next) => onChange(next as AnalyticsTab)}>
      <Tabs.List
        style={{
          borderRadius: 24,
          backgroundColor: colors.fill,
          borderWidth: 1,
          borderColor: colors.divider,
          padding: 3,
        }}
      >
        <Tabs.Indicator style={{ borderRadius: 21, backgroundColor: colors.ink }} />
        {tabs.map(([tab, label]) => (
          <Tabs.Trigger
            key={tab}
            value={tab}
            accessibilityLabel={label}
            style={{ flex: 1, paddingVertical: 10 }}
          >
            <Tabs.Label style={{ color: value === tab ? colors.onInk : colors.muted }}>{label}</Tabs.Label>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs>
  );
}
