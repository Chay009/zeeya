import { Tabs } from "heroui-native";
import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { hp } from "@/features/home-preview/theme";

import { INSIGHTS_TIME_SCOPES, type InsightsTimeScope } from "../analytics-scope";

export function AnalyticsScopeTabs({
  value,
  onChange,
}: {
  value: InsightsTimeScope;
  onChange(value: InsightsTimeScope): void;
}) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ fontSize: 11, fontWeight: "700", color: hp.muted }}>Time range</Text>
      <Tabs
        value={value}
        onValueChange={(next) => onChange(next as InsightsTimeScope)}
        style={{ marginTop: 8 }}
      >
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
          {INSIGHTS_TIME_SCOPES.map((scope) => (
            <Tabs.Trigger
              key={scope.value}
              value={scope.value}
              accessibilityLabel={`${scope.label}, ${scope.detail}`}
              accessibilityHint={`Show ${scope.detail.toLowerCase()} analytics`}
              style={{ flex: 1, minHeight: 44, paddingVertical: 10 }}
            >
              <Tabs.Label style={{ color: value === scope.value ? hp.onInk : hp.muted }}>
                {scope.label}
              </Tabs.Label>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs>
    </View>
  );
}
