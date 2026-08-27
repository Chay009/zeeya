import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { BackHandler, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AccountCard } from "../components/account-card";
import { ActivityList } from "../components/activity-list";
import { ActivitySection } from "../components/activity-section";
import { AccountEvidenceSection } from "../components/account-evidence-section";
import { BudgetCard } from "../components/budget-card";
import { CashflowCard } from "../components/cashflow-card";
import { HomePermissionCard } from "../components/home-permission-card";
import { SubscriptionDetail } from "../components/subscription-detail";
import { SubscriptionsList } from "../components/subscriptions-list";
import { SubscriptionsSummaryCard } from "../components/subscriptions-summary-card";
import { useDashboardSync } from "@/features/dashboard/hooks/use-dashboard-sync";
import { createHomePreviewData, type PreviewSub } from "../data";
import { hp } from "../theme";

type DrawerNavigation = { openDrawer: () => void };

export function HomePreviewScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<DrawerNavigation>();
  const { dashboard, status, error, connect } = useDashboardSync();
  const homeData = useMemo(
    () => createHomePreviewData(dashboard, status === "ready"),
    [dashboard, status],
  );
  const [view, setView] = useState<"home" | "subscriptions" | "activity" | "detail">("home");
  const [selectedSubscription, setSelectedSubscription] = useState<PreviewSub | null>(null);
  const connectedAccountCount = homeData.accounts.length;
  const detectedAccountCount = homeData.detectedAccounts.length;
  const bankNames = [
    ...new Set(homeData.accounts.map((account) => account.bankName).filter(Boolean)),
  ];
  const accountSourceLabel =
    bankNames.length > 1 ? `${bankNames.length} banks` : (bankNames[0] ?? "Detected balance");

  const openDetail = (subscription: PreviewSub) => {
    setSelectedSubscription(subscription);
    setView("detail");
  };

  useEffect(() => {
    if (view === "home") return;

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setView((current) => (current === "detail" ? "subscriptions" : "home"));
      return true;
    });

    return () => subscription.remove();
  }, [view]);

  return (
    <View style={{ flex: 1, backgroundColor: hp.background }}>
      {view === "home" ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: Math.max(12, insets.top),
            paddingBottom: 28,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={{
              marginTop: 24,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 16,
                  backgroundColor: "#f3be7c",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 17, fontWeight: "800", color: "#704626" }}>RS</Text>
              </View>
              <View>
                <Text style={{ fontSize: 20, fontWeight: "800", color: hp.ink }}>
                  {homeData.displayName}
                </Text>
                <Text style={{ marginTop: 2, fontSize: 14, color: hp.muted }}>
                  {homeData.greeting}
                </Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open navigation menu"
              onPress={() => navigation.openDrawer()}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: hp.borderSoft,
                backgroundColor: "rgba(255,255,255,0.75)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="ellipsis-horizontal" size={19} color="#2f5245" />
            </Pressable>
          </View>

          <HomePermissionCard status={status} error={error} onConnect={connect} />

          {status === "ready" ? (
            <>
              <View
                style={{
                  marginTop: 16,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                }}
              >
                <View>
                  <Text
                    style={{ fontSize: 10, fontWeight: "700", letterSpacing: 2, color: hp.muted }}
                  >
                    TODAY AT A GLANCE
                  </Text>
                  <Text
                    style={{
                      marginTop: 4,
                      fontSize: 26,
                      fontWeight: "800",
                      letterSpacing: -1.55,
                      color: hp.ink,
                    }}
                  >
                    Money overview
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    borderWidth: 1,
                    borderColor: hp.border,
                    backgroundColor: "rgba(255,255,255,0.6)",
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#58635a" }}>
                    {homeData.monthLabel}
                  </Text>
                </View>
              </View>

              <View
                style={{
                  marginTop: 20,
                  flexDirection: "row",
                  justifyContent: "flex-start",
                  paddingHorizontal: 4,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#7c857d" }}>
                  {connectedAccountCount > 1
                    ? `${connectedAccountCount} accounts`
                    : connectedAccountCount === 1
                      ? "Primary account"
                      : "No confirmed balance account"}
                  <Text style={{ color: "#b0b5ac" }}>
                    {connectedAccountCount > 0
                      ? ` · ${accountSourceLabel}`
                      : detectedAccountCount > 0
                        ? " · Detection only"
                        : " · No bank balance yet"}
                  </Text>
                </Text>
              </View>

              {homeData.accounts.length > 0 ? (
                <View style={{ marginTop: 8, gap: 8 }}>
                  {homeData.accounts.map((account) => (
                    <AccountCard key={account.key} account={account} />
                  ))}
                </View>
              ) : (
                <View
                  style={{
                    marginTop: 8,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: hp.border,
                    backgroundColor: "rgba(255,255,255,0.72)",
                    padding: 16,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "800", color: hp.ink }}>
                    No bank-reported balance yet
                  </Text>
                  <Text style={{ marginTop: 4, fontSize: 11, lineHeight: 16, color: hp.muted }}>
                    Detected identities are listed separately below and do not affect balances.
                  </Text>
                </View>
              )}

              <AccountEvidenceSection
                detectedAccounts={homeData.detectedAccounts}
                unassignedReadings={homeData.unassignedReadings}
              />

              <CashflowCard data={homeData.cashflow} />
              <BudgetCard {...homeData.budget} />
              <SubscriptionsSummaryCard
                subscriptions={homeData.subscriptions}
                onOpen={() => setView("subscriptions")}
              />
              <ActivitySection activity={homeData.activity} onSeeAll={() => setView("activity")} />
            </>
          ) : null}
        </ScrollView>
      ) : view === "subscriptions" ? (
        <SubscriptionsList
          onBack={() => setView("home")}
          onSelect={openDetail}
          topInset={insets.top}
          subscriptions={homeData.subscriptions}
        />
      ) : view === "activity" ? (
        <ActivityList
          activity={homeData.activity}
          onBack={() => setView("home")}
          topInset={insets.top}
        />
      ) : selectedSubscription ? (
        <SubscriptionDetail
          subscription={selectedSubscription}
          onBack={() => setView("subscriptions")}
          topInset={insets.top}
        />
      ) : null}

      {view === "home" && (
        <View
          style={{
            paddingHorizontal: 20,
            paddingBottom: Math.max(12, insets.bottom),
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              borderRadius: 22,
              borderWidth: 1,
              borderColor: hp.border,
              backgroundColor: hp.background,
              padding: 6,
            }}
          >
            <View
              style={{
                flex: 1,
                alignItems: "center",
                gap: 4,
                borderRadius: 17,
                paddingVertical: 6,
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: "#dff5e6",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="home" size={18} color={hp.emeraldDeep} />
              </View>
              <Text style={{ fontSize: 10, fontWeight: "800", color: hp.emeraldDeep }}>Home</Text>
            </View>

            <View style={{ flex: 1, alignItems: "center", gap: 4, paddingVertical: 6 }}>
              <View
                style={{ width: 48, height: 32, alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="stats-chart" size={18} color="#9aa79f" />
              </View>
              <Text style={{ fontSize: 10, fontWeight: "700", color: "#9aa79f" }}>Insights</Text>
            </View>

            <View style={{ flex: 1, alignItems: "center", gap: 4, paddingVertical: 6 }}>
              <View
                style={{ width: 48, height: 32, alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="person-circle-outline" size={18} color="#9aa79f" />
              </View>
              <Text style={{ fontSize: 10, fontWeight: "700", color: "#9aa79f" }}>Profile</Text>
            </View>
          </View>

          <View
            style={{
              alignSelf: "center",
              marginTop: 12,
              width: 112,
              height: 4,
              borderRadius: 2,
              backgroundColor: "rgba(18,37,31,0.18)",
            }}
          />
        </View>
      )}
    </View>
  );
}
