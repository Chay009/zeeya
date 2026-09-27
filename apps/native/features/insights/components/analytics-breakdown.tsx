import { useState } from "react";
import { Pressable, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { Tabs } from "heroui-native";

import type { AnalyticsTab } from "../analytics-scope";
import { AnalyticsCard } from "./analytics-card";

export type AnalyticsBreakdownView = "categories" | "merchants" | "activity";

const OUTCOME_VIEWS: readonly [AnalyticsBreakdownView, string][] = [
  ["categories", "Categories"],
  ["merchants", "Merchants"],
  ["activity", "Activity"],
];

export function AnalyticsBreakdown({
  mode,
  onSeeAll,
  onOpenSubscriptions,
  subscriptionLabel,
  categories,
  merchants,
  activity,
}: {
  mode: AnalyticsTab;
  onSeeAll: (view: AnalyticsBreakdownView) => void;
  onOpenSubscriptions?: () => void;
  subscriptionLabel?: string | null;
  categories: React.ReactNode;
  merchants: React.ReactNode;
  activity: React.ReactNode;
}) {
  const [pickedView, setView] = useState<AnalyticsBreakdownView>("categories");
  // Income has only an activity view — derived, so it is right on the very
  // first render, and the outcome pick survives a round trip through income.
  const view: AnalyticsBreakdownView = mode === "income" ? "activity" : pickedView;

  const views = mode === "income" ? ([["activity", "Activity"]] as const) : OUTCOME_VIEWS;
  const active = view === "categories" ? categories : view === "merchants" ? merchants : activity;
  const seeAllLabel =
    view === "categories" ? "All categories" : view === "merchants" ? "All merchants" : "All activity";

  return (
    <AnalyticsCard>
      {views.length > 1 ? (
        <Tabs value={view} onValueChange={(next) => setView(next as AnalyticsBreakdownView)}>
          <Tabs.List className="rounded-pill bg-fill p-1">
            <Tabs.Indicator className="rounded-pill bg-card" />
            {views.map(([value, label]) => (
              <Tabs.Trigger key={value} value={value} className="min-h-9 flex-1">
                <Tabs.Label
                  className={`text-caption font-bold ${view === value ? "text-ink" : "text-muted"}`}
                >
                  {label}
                </Tabs.Label>
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Tabs>
      ) : (
        <Text className="text-base font-bold text-ink">Activity</Text>
      )}

      <View className="mt-2">{active}</View>

      {view === "merchants" && subscriptionLabel && onOpenSubscriptions ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open subscriptions"
          onPress={onOpenSubscriptions}
          className="mt-2 min-h-12 flex-row items-center justify-between border-t border-fill pt-3"
        >
          <Text className="text-subtitle font-semibold text-ink">Subscriptions</Text>
          <Text className="text-caption font-bold text-accent-deep">{subscriptionLabel}</Text>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => onSeeAll(view)}
        className="mt-3 min-h-11 items-center justify-center"
      >
        <Text className="text-caption font-bold text-accent-deep">{seeAllLabel}</Text>
      </Pressable>
    </AnalyticsCard>
  );
}
