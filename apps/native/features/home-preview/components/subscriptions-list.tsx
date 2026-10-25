import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { Segmented } from "@/components/ui/controls";
import { NavBar } from "@/components/ui/header";
import { SCREEN_PADDING_X } from "@/components/ui/screen";
import { Row, RowGroup } from "@/components/ui/list";
import { EmptyState } from "@/components/ui/states";

import type { HomePreviewData, PreviewSub } from "../data";
import { BrandLogo } from "./brand-logo";
import { SubscriptionSpendValue } from "./subscription-ui";

// Subscriptions: what recurring costs you a month, then every commitment as
// a grouped list you can filter by how it's charged.

type Filter = "all" | PreviewSub["type"];

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "autopay", label: "Autopay" },
  { value: "recurring", label: "Recurring" },
  { value: "manual", label: "Manual" },
];

export function SubscriptionsList({
  onBack,
  onSelect,
  topInset,
  subscriptions,
}: {
  onBack: () => void;
  onSelect: (subscription: PreviewSub) => void;
  topInset: number;
  subscriptions: HomePreviewData["subscriptions"];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const visible = useMemo(
    () =>
      filter === "all"
        ? subscriptions.items
        : subscriptions.items.filter((sub) => sub.type === filter),
    [filter, subscriptions.items],
  );
  const active = visible.filter((item) => item.status === "Active");
  const cancelled = visible.filter((item) => item.status !== "Active");

  const renderRows = (items: PreviewSub[]) => (
    <RowGroup animated>
      {items.map((item) => {
        const isCancelled = item.status !== "Active";
        return (
          <Row
            key={item.key}
            onPress={() => onSelect(item)}
            accessibilityLabel={`Open ${item.name}`}
            leading={
              <View style={{ opacity: isCancelled ? 0.5 : 1 }}>
                <BrandLogo
                  letter={item.letter}
                  tile={item.tile}
                  ink={item.ink}
                  img={item.img}
                  size={40}
                  radius={20}
                  iconRatio={0.6}
                />
              </View>
            }
            title={
              <Text
                numberOfLines={1}
                className={`text-body font-semibold ${isCancelled ? "text-muted" : "text-ink"}`}
              >
                {item.name}
              </Text>
            }
            subtitle={`${item.typeLabel} · ${item.dateLabel}${item.reactivated ? " · Reactivated" : ""}`}
            trailing={
              <Text
                className={`text-body font-semibold ${isCancelled ? "text-faint line-through" : "text-ink"}`}
              >
                {item.amount}
              </Text>
            }
            trailingSubtitle={isCancelled ? "Cancelled" : "/ month"}
          />
        );
      })}
    </RowGroup>
  );

  return (
    <View className="flex-1 bg-background">
      <NavBar title="Subscriptions" onBack={onBack} topInset={topInset} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: SCREEN_PADDING_X, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mt-2 rounded-card bg-card p-5">
          <Text className="text-caption font-medium text-muted">Recurring spend</Text>
          <SubscriptionSpendValue value={subscriptions.monthlySpend} size={34} />
          <Text className="mt-2 text-caption text-muted">
            {subscriptions.activeCount} active · {subscriptions.cancelledCount} cancelled
          </Text>
        </View>

        <Segmented
          value={filter}
          options={FILTERS}
          onChange={setFilter}
          size="sm"
          className="mt-5"
        />

        {visible.length === 0 ? (
          <View className="mt-5 rounded-card bg-card">
            <EmptyState
              compact
              icon="repeat"
              art="hero-subscriptions"
              title="Nothing here yet"
              body="Try another filter."
            />
          </View>
        ) : (
          <>
            {active.length > 0 ? (
              <View className="mt-6">
                <Text className="mb-2 px-1 text-caption font-semibold text-ink-soft">Active</Text>
                {renderRows(active)}
              </View>
            ) : null}
            {cancelled.length > 0 ? (
              <View className="mt-6">
                <Text className="mb-2 px-1 text-caption font-semibold text-ink-soft">
                  Cancelled
                </Text>
                {renderRows(cancelled)}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}
