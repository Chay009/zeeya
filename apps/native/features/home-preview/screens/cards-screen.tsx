import { useMemo } from "react";
import { useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "@/components/app-text";
import { NavBar } from "@/components/ui/header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/states";
import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";
import { useHomeReadModel } from "@/features/dashboard/hooks/home-read-model";
import { moneyFontFamily } from "@/lib/fonts";

import { AccountCard } from "../components/account-card";
import { AccountEvidenceSection } from "../components/account-evidence-section";
import { HomePermissionCard } from "../components/home-permission-card";
import { createHomePreviewDataFromReadModel } from "../data";

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

export function CardsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
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
    <View className="flex-1 bg-background">
      <NavBar title="Accounts" onBack={() => router.back()} topInset={insets.top} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mt-2 rounded-card bg-card p-5">
          <Text className="text-caption font-medium text-muted">
            {count > 0 ? `Across ${count} account${count === 1 ? "" : "s"}` : "Accounts"}
          </Text>
          {netAcross && netAcross !== "—" ? (
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              className="mt-1 text-hero text-ink"
              style={{ fontFamily: moneyFontFamily("bold"), letterSpacing: -1 }}
            >
              {netAcross}
            </Text>
          ) : (
            <Text className="mt-1 text-body text-muted">No bank-reported balance yet</Text>
          )}
        </View>

        <HomePermissionCard
          status={status}
          error={error}
          progress={progress}
          onConnect={connect}
          hasData={readModel !== null}
        />

        {status === "ready" ? (
          <>
            {count > 0 ? (
              <Section title="Cards">
                <View className="gap-4">
                  {homeData.accounts.map((account) => (
                    <AccountCard key={account.key} account={account} defaultExpanded />
                  ))}
                </View>
              </Section>
            ) : (
              <View className="mt-6 rounded-card bg-card">
                <EmptyState
                  icon="card"
                  title="No confirmed accounts yet"
                  body="An account appears once a bank message reports its balance."
                />
              </View>
            )}

            <AccountEvidenceSection
              detectedAccounts={homeData.detectedAccounts}
              unassignedReadings={homeData.unassignedReadings}
            />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
