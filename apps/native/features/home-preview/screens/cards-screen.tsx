import { useMemo } from "react";
import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "@/components/app-text";
import { useFloatingTabBarClearance } from "@/components/floating-tab-bar";
import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";
import { useHomeReadModel } from "@/features/dashboard/hooks/home-read-model";
import { headingFontFamily, moneyFontFamily } from "@/lib/fonts";

import { AccountCard } from "../components/account-card";
import { AccountEvidenceSection } from "../components/account-evidence-section";
import { HomePermissionCard } from "../components/home-permission-card";
import { createHomePreviewDataFromReadModel } from "../data";
import { homeRadius, homeSpacing, hp } from "../theme";

const PAGE_PADDING = 20;

const EMPTY_READ_MODEL = {
  currency: "INR",
  accounts: [],
  detectedAccounts: [],
  unassignedReadings: [],
  monthTotals: { incomeByCurrency: {}, expenseByCurrency: {} },
  categoryTotalsByCurrency: {},
  availableCurrencies: [] as string[],
  flowDays: [],
  calendarMonths: { items: [], nextCursor: null },
  subscriptionOverview: {
    items: [],
    totalsByCurrency: {},
    activeCount: 0,
    cancelledCount: 0,
  },
  recentActivity: [],
  activityCategoryCounts: [],
  totalActivityCount: 0,
};

// The sheet the cards sit on. Two planes — tinted page above, white sheet
// below — is what separates "here is the summary" from "here are the
// things", without a heading having to say so.
const sheetShadow = Platform.select({
  ios: {
    shadowColor: hp.ink,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
  },
  android: { elevation: 3 },
  default: {},
});

export function CardsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarClearance = useFloatingTabBarClearance();
  const { status, error, progress, connect } = useDashboardSync();
  const { model: readModel } = useHomeReadModel("INR");
  const homeData = useMemo(
    () =>
      createHomePreviewDataFromReadModel(
        readModel ?? EMPTY_READ_MODEL,
        status === "ready" && readModel !== null,
      ),
    [readModel, status],
  );
  const count = homeData.accounts.length;
  const netAcross = homeData.accounts[0]?.netAcross ?? null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: hp.background }}
      contentContainerStyle={{ paddingBottom: tabBarClearance }}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={{
          paddingHorizontal: PAGE_PADDING,
          paddingTop: Math.max(20, insets.top),
          paddingBottom: homeSpacing.lg,
        }}
      >
        <Text style={{ fontSize: 14, color: hp.mutedSoft }}>Your accounts</Text>

        <View style={{ marginTop: 4, flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <Text
            style={{
              fontFamily: headingFontFamily("bold"),
              fontSize: 34,
              letterSpacing: -0.8,
              color: hp.ink,
            }}
          >
            Cards
          </Text>
          {count > 0 && (
            <Text
              style={{
                fontFamily: headingFontFamily("bold"),
                fontSize: 34,
                letterSpacing: -0.8,
                color: hp.faint,
              }}
            >
              ({count})
            </Text>
          )}
        </View>

        {netAcross && netAcross !== "—" && (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            style={{
              marginTop: 10,
              fontFamily: moneyFontFamily("semibold"),
              fontSize: 30,
              letterSpacing: -0.6,
              color: hp.ink,
            }}
          >
            {netAcross}
          </Text>
        )}

        <HomePermissionCard status={status} error={error} progress={progress} onConnect={connect} />
      </View>

      {status === "ready" && (
        <View
          style={{
            backgroundColor: hp.card,
            borderTopLeftRadius: homeRadius.hero,
            borderTopRightRadius: homeRadius.hero,
            paddingHorizontal: PAGE_PADDING,
            paddingTop: homeSpacing.md,
            paddingBottom: homeSpacing.lg,
            minHeight: 420,
            ...sheetShadow,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 38,
              height: 4,
              borderRadius: 2,
              backgroundColor: hp.track,
            }}
          />

          {count > 0 ? (
            <View style={{ marginTop: homeSpacing.lg, gap: homeSpacing.md }}>
              {homeData.accounts.map((account) => (
                <AccountCard key={account.key} account={account} defaultExpanded />
              ))}
            </View>
          ) : (
            <View style={{ marginTop: homeSpacing.lg, alignItems: "center", paddingVertical: 28 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: hp.ink }}>
                No bank-reported balance yet
              </Text>
              <Text
                style={{
                  marginTop: 6,
                  fontSize: 13,
                  lineHeight: 19,
                  textAlign: "center",
                  color: hp.mutedSoft,
                }}
              >
                Detected identities are listed below and do not affect balances.
              </Text>
            </View>
          )}

          <AccountEvidenceSection
            detectedAccounts={homeData.detectedAccounts}
            unassignedReadings={homeData.unassignedReadings}
          />
        </View>
      )}
    </ScrollView>
  );
}
