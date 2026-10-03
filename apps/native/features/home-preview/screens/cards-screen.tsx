import { useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "@/components/app-text";
import { NavBar } from "@/components/ui/header";
import { Section } from "@/components/ui/section";
import {
  Delayed,
  EmptyState,
  ErrorState,
  SkeletonBlock,
  SkeletonRows,
} from "@/components/ui/states";
import { moneyFontFamily } from "@/lib/fonts";

import { ALL_ACCOUNTS_KEY, scopedHeroBalance } from "../account-scope";
import { AccountCard } from "../components/account-card";
import { AccountEvidenceSection } from "../components/account-evidence-section";
import { HomePermissionCard } from "../components/home-permission-card";
import { useHomeData } from "../hooks/use-home-data";

export function CardsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { model, homeData, isLoading, error, reload } = useHomeData();
  const count = homeData.accounts.length;
  // The same all-accounts total Home leads with — every currency, not just
  // the first account's.
  const netAcross = count > 0 ? scopedHeroBalance(homeData.accounts, ALL_ACCOUNTS_KEY) : null;

  return (
    <View className="flex-1 bg-background">
      <NavBar title="Accounts" onBack={() => router.back()} topInset={insets.top} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mt-2 rounded-card bg-card p-5">
          {isLoading ? (
            <Delayed minHeight={64}>
              <SkeletonBlock className="h-3.5 w-28" />
              <SkeletonBlock className="mt-3 h-10 w-44" />
            </Delayed>
          ) : (
            <>
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
            </>
          )}
        </View>

        <HomePermissionCard hasData={model !== null} />

        {isLoading ? (
          <View className="mt-6">
            <SkeletonRows count={3} />
          </View>
        ) : model === null ? (
          <View className="mt-6 rounded-card bg-card">
            <ErrorState compact title="Couldn't load accounts" body={error} onRetry={reload} />
          </View>
        ) : (
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
                  art="hero-cards"
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
        )}
      </ScrollView>
    </View>
  );
}
