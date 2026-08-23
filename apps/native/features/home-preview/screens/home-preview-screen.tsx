import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { BackHandler, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { PreviewSub } from "../data";
import { ActivitySection } from "../components/activity-section";
import { BudgetCard } from "../components/budget-card";
import { CashflowCard } from "../components/cashflow-card";
import { SubscriptionDetail } from "../components/subscription-detail";
import { SubscriptionsList } from "../components/subscriptions-list";
import { SubscriptionsSummaryCard } from "../components/subscriptions-summary-card";
import { hp } from "../theme";

export function HomePreviewScreen() {
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<"home" | "subscriptions" | "detail">("home");
  const [selectedSubscription, setSelectedSubscription] = useState<PreviewSub | null>(null);

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
            paddingBottom: 140,
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
                <Text style={{ fontSize: 20, fontWeight: "800", color: hp.ink }}>Rahul Sharma</Text>
                <Text style={{ marginTop: 2, fontSize: 14, color: hp.muted }}>Good evening</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
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
                <Ionicons name="notifications-outline" size={18} color="#2f5245" />
              </Pressable>
              <Pressable
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
          </View>

          <View
            style={{
              marginTop: 16,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-end",
            }}
          >
            <View>
              <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 2, color: hp.muted }}>
                TODAY AT A GLANCE
              </Text>
              <Text style={{ marginTop: 4, fontSize: 26, fontWeight: "800", color: hp.ink }}>
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
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#58635a" }}>May 2024</Text>
              <Ionicons name="chevron-down" size={14} color="#58635a" />
            </View>
          </View>

          <View
            style={{
              marginTop: 20,
              flexDirection: "row",
              justifyContent: "space-between",
              paddingHorizontal: 4,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#7c857d" }}>
              Primary account <Text style={{ color: "#b0b5ac" }}>· HDFC Bank</Text>
            </Text>
            <Text style={{ fontSize: 12, fontWeight: "800", color: hp.emeraldDeep }}>Manage</Text>
          </View>

          <View
            style={{
              marginTop: 8,
              borderRadius: 27,
              backgroundColor: hp.mint,
              padding: 20,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                position: "absolute",
                right: -32,
                top: -80,
                width: 208,
                height: 208,
                borderRadius: 104,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.25)",
              }}
            />
            <View
              style={{
                position: "absolute",
                right: -38,
                bottom: -112,
                width: 192,
                height: 192,
                borderRadius: 96,
                borderWidth: 1,
                borderColor: "rgba(24,84,61,0.18)",
              }}
            />
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: "white",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 9, fontWeight: "800", color: hp.emerald }}>H</Text>
                </View>
                <Text style={{ fontSize: 15, fontWeight: "800", color: "white" }}>HDFC BANK</Text>
              </View>
              <View
                style={{
                  borderRadius: 999,
                  backgroundColor: "rgba(255,255,255,0.15)",
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ fontSize: 9, fontWeight: "800", color: "rgba(255,255,255,0.9)" }}>
                  ACTIVE
                </Text>
              </View>
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-end",
                marginTop: 28,
              }}
            >
              <View>
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "700",
                    letterSpacing: 1.8,
                    color: "rgba(255,255,255,0.65)",
                  }}
                >
                  AVAILABLE BALANCE
                </Text>
                <Text style={{ marginTop: 4, fontSize: 27, fontWeight: "800", color: "white" }}>
                  ₹1,27,711
                  <Text style={{ fontSize: 17, color: "rgba(255,255,255,0.65)" }}>.50</Text>
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.65)" }}>
                  •••• 3311
                </Text>
                <Text
                  style={{
                    marginTop: 8,
                    fontSize: 10,
                    fontWeight: "700",
                    color: "rgba(255,255,255,0.65)",
                  }}
                >
                  Net across accounts
                </Text>
                <Text style={{ fontSize: 15, fontWeight: "800", color: "white" }}>₹3,24,590</Text>
              </View>
            </View>
          </View>

          <CashflowCard />
          <BudgetCard />
          <SubscriptionsSummaryCard onOpen={() => setView("subscriptions")} />
          <ActivitySection />
        </ScrollView>
      ) : view === "subscriptions" ? (
        <SubscriptionsList
          onBack={() => setView("home")}
          onSelect={openDetail}
          topInset={insets.top}
        />
      ) : selectedSubscription ? (
        <SubscriptionDetail
          subscription={selectedSubscription}
          onBack={() => setView("subscriptions")}
          topInset={insets.top}
        />
      ) : null}

      <View
        style={{
          position: "absolute",
          left: 20,
          right: 20,
          bottom: Math.max(12, insets.bottom),
        }}
      >
        <Pressable
          style={{
            position: "absolute",
            right: 12,
            top: -28,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: hp.inkDeep,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 4,
            borderColor: hp.background,
          }}
        >
          <Ionicons name="add" size={28} color={hp.lime} />
        </Pressable>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            borderRadius: 22,
            borderWidth: 1,
            borderColor: hp.border,
            backgroundColor: "rgba(251,255,252,0.92)",
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
            <View style={{ width: 48, height: 32, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="stats-chart" size={18} color="#9aa79f" />
            </View>
            <Text style={{ fontSize: 10, fontWeight: "700", color: "#9aa79f" }}>Insights</Text>
          </View>

          <View style={{ flex: 1, alignItems: "center", gap: 4, paddingVertical: 6 }}>
            <View style={{ width: 48, height: 32, alignItems: "center", justifyContent: "center" }}>
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
    </View>
  );
}
