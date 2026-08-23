import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  View,
} from "react-native";

import { dashboardTheme as t } from "@/constants/dashboard-theme";
import { ActivityRow } from "@/features/dashboard/components/activity-row";
import { BankGroupCard } from "@/features/dashboard/components/bank-group-card";
import { MandateList } from "@/features/dashboard/components/mandate-list";
import { StatusCards } from "@/features/dashboard/components/status-cards";
import { StatRow } from "@/features/dashboard/components/stat-row";
import { SubscriptionSummary } from "@/features/dashboard/components/subscription-summary";
import { useDashboardSync } from "@/features/dashboard/hooks/use-dashboard-sync";
import { currenciesOf } from "@/features/dashboard/utils/format";
import {
  ACTIVITY_CATEGORY_FILTERS,
  indexActivityByCategory,
  type ActivityCategoryFilter,
} from "@/lib/activity-filters";
import { isRecurringTransaction } from "@/lib/dashboard";

export function DashboardScreen() {
  const { status, error, dashboard, refreshing, connect, onRefresh } = useDashboardSync();
  const [activityFilter, setActivityFilter] = useState<ActivityCategoryFilter>("all");

  const activityByCategory = useMemo(
    () => indexActivityByCategory(dashboard.activity),
    [dashboard.activity],
  );
  const filteredActivity = activityByCategory.get(activityFilter) ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <StatusBar barStyle="light-content" />
      <FlatList
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        data={status === "ready" ? filteredActivity.slice(0, 25) : []}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.accent} />
        }
        ListHeaderComponent={
          <View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 24,
              }}
            >
              <Text style={{ color: t.textPrimary, fontSize: 24, fontWeight: "800" }}>zeeya</Text>
              <Pressable onPress={() => router.push("/backfill")} hitSlop={10}>
                <Ionicons name="ellipsis-horizontal-circle-outline" size={26} color={t.textMuted} />
              </Pressable>
            </View>

            <StatusCards status={status} error={error} onConnect={connect} />

            {status === "ready" && (
              <>
                {currenciesOf(
                  dashboard.monthIncomeByCurrency,
                  dashboard.monthExpenseByCurrency,
                ).map((currency) => (
                  <StatRow
                    key={currency}
                    currency={currency}
                    income={dashboard.monthIncomeByCurrency[currency] ?? 0}
                    expense={dashboard.monthExpenseByCurrency[currency] ?? 0}
                  />
                ))}

                {dashboard.banks.map((bank) => (
                  <BankGroupCard key={bank.bankName.toLowerCase()} bank={bank} />
                ))}

                <MandateList groups={dashboard.mandatesByMerchant} />

                <SubscriptionSummary subscriptions={dashboard.subscriptions} />

                <Text
                  style={{
                    color: t.accent,
                    fontWeight: "700",
                    fontSize: 15,
                    marginBottom: 12,
                    marginTop: 4,
                  }}
                >
                  Recent activity
                </Text>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingBottom: 14 }}
                >
                  {ACTIVITY_CATEGORY_FILTERS.map((option) => {
                    const selected = activityFilter === option.value;
                    const count =
                      option.value === "all"
                        ? dashboard.activity.length
                        : (activityByCategory.get(option.value)?.length ?? 0);
                    return (
                      <Pressable
                        key={option.value}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => setActivityFilter(option.value)}
                        style={{
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: selected ? t.accent : t.border,
                          backgroundColor: selected ? t.accentMuted : t.surfaceMuted,
                          paddingHorizontal: 13,
                          paddingVertical: 8,
                        }}
                      >
                        <Text
                          style={{
                            color: selected ? t.textPrimary : t.textMuted,
                            fontSize: 12,
                            fontWeight: selected ? "700" : "600",
                          }}
                        >
                          {option.label} {count}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {filteredActivity.length === 0 && (
                  <Text style={{ color: t.textMuted, fontSize: 13 }}>
                    No messages found in this category.
                  </Text>
                )}
              </>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <ActivityRow item={item} isRecurring={isRecurringTransaction(item, dashboard)} />
        )}
      />
    </View>
  );
}
