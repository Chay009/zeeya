import { Tabs } from "heroui-native";

import { hp } from "@/features/home-preview/theme";

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
          backgroundColor: hp.surfaceMuted,
          borderWidth: 1,
          borderColor: hp.borderSoft,
          padding: 3,
        }}
      >
        <Tabs.Indicator style={{ borderRadius: 21, backgroundColor: hp.ink }} />
        {tabs.map(([tab, label]) => (
          <Tabs.Trigger
            key={tab}
            value={tab}
            accessibilityLabel={label}
            style={{ flex: 1, paddingVertical: 10 }}
          >
            <Tabs.Label style={{ color: value === tab ? hp.onInk : hp.muted }}>{label}</Tabs.Label>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs>
  );
}
