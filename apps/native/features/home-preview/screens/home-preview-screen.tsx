import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "@/components/app-text";
import { useFloatingTabBarClearance } from "@/components/floating-tab-bar";
import { EnterTransition } from "@/components/native-ui/enter-transition";
import { moneyFontFamily } from "@/lib/fonts";
import { useToday } from "@/lib/today";
import { LargeTitle } from "@/components/ui/header";
import { Section } from "@/components/ui/section";
import {
  Delayed,
  ErrorState,
  SkeletonBlock,
  SkeletonHero,
  SkeletonRows,
} from "@/components/ui/states";

import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";
import { useHomeRecentActivity } from "@/features/dashboard/hooks/home-recent-activity";
import type { ActivityCategoryFilter } from "@/lib/activity-filters";

import {
  ALL_ACCOUNTS_KEY,
  accountScopeCaption,
  resolveScopedAccountId,
  scopedHeroBalance,
} from "../account-scope";
import { AccountScopeChips } from "../components/account-scope-chips";
import { ActivitySection } from "../components/activity-section";
import { HomeBudgetCard } from "@/features/budgets/components/home-budget-card";
import { CashflowCard } from "../components/cashflow-card";
import { HomePermissionCard } from "../components/home-permission-card";
import { HomeHighlightsPanel } from "../components/home-highlights-panel";
import { NewTransactionsDialog } from "../components/new-transactions-dialog";
import {
  buildActivityDetailRoute,
  buildTransactionDetailRoute,
  summarizeCaughtUpTransactions,
  type HomeActivityViewItem,
} from "../data";
import { useThemeColors } from "@/components/ui/theme";
import { useHomeAccountCashflowScope } from "../hooks/use-home-account-cashflow-scope";
import { useHomeActivityScope } from "../hooks/use-home-activity-scope";
import { useHomeData } from "../hooks/use-home-data";
import { useHomeHighlights } from "../hooks/use-home-highlights";
import { useHomeScreenModel } from "../hooks/use-home-screen-model";


export function HomePreviewScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const tabBarClearance = useFloatingTabBarClearance();
  const router = useRouter();
  // Only the sync fields Home renders. Per-page scan progress is read by
  // HomePermissionCard itself, so a running sync never re-renders Home.
  const { status, caughtUpTransactions, dismissCaughtUp, refreshing, onRefresh } =
    useDashboardSync((state) => ({
      status: state.status,
      caughtUpTransactions: state.caughtUpTransactions,
      dismissCaughtUp: state.dismissCaughtUp,
      refreshing: state.refreshing,
      onRefresh: state.onRefresh,
    }));

  // The currency the chart selector picked, if any. Otherwise Home shows the
  // primary currency — known before first render (the boot cache reads the
  // primary-first currency list first), so there is no load-then-adopt.
  const [explicitCurrency, setExplicitCurrency] = useState<string | undefined>(undefined);
  const {
    currency: loadCurrency,
    model: readModel,
    homeData,
    isLoading,
    error: readModelError,
    reload: reloadReadModel,
  } = useHomeData(explicitCurrency);
  const today = useToday();
  const [selectedFilter, setSelectedFilter] = useState<ActivityCategoryFilter>("all");
  const [selectedAccountKey, setSelectedAccountKey] = useState(ALL_ACCOUNTS_KEY);

  const scopedAccountId = resolveScopedAccountId(homeData.accounts, selectedAccountKey);
  const needsAuxiliaryActivity = scopedAccountId !== undefined || selectedFilter !== "all";
  const highlightsQuery = useMemo(
    () => ({ currency: loadCurrency, at: today, accountId: scopedAccountId }),
    [today, loadCurrency, scopedAccountId],
  );
  const {
    highlights,
    status: highlightsStatus,
    error: highlightsError,
    reload: reloadHighlights,
  } = useHomeHighlights(highlightsQuery);
  const { scope: activityScope, status: activityScopeStatus } =
    useHomeActivityScope(scopedAccountId);
  const cashflowScope = useHomeAccountCashflowScope(scopedAccountId, loadCurrency);
  const {
    items: scopedActivityItems,
    status: scopedActivityStatus,
    error: scopedActivityError,
    reload: reloadScopedActivity,
  } = useHomeRecentActivity(
    selectedFilter === "all" ? undefined : selectedFilter,
    20,
    needsAuxiliaryActivity,
    scopedAccountId,
  );

  const {
    displayHomeData,
    homeDataForSection,
    activityQueryStatus,
    activityQueryError,
    reloadActivity,
    isCashflowScopeRefreshing,
  } = useHomeScreenModel({
    homeData,
    scopedAccountId,
    cashflowScope,
    loadCurrency,
    needsAuxiliaryActivity,
    scopedActivityItems,
    scopedActivityStatus,
    scopedActivityError,
    reloadScopedActivity,
    activityScope,
    activityScopeStatus,
  });

  // One source: transactions whose SMS arrived since the last dismissal, read
  // from SQLite's arrival log. Survives restarts, and each transaction
  // appears once (keyed by transaction id).
  const newTransactionSummaries = useMemo(
    () => summarizeCaughtUpTransactions(caughtUpTransactions.items),
    [caughtUpTransactions.items],
  );
  const newTransactionTotal = caughtUpTransactions.total;

  // The body renders whenever local data exists — a running inbox sync never
  // hides it (the sync's publish updates it live). With no data at all, the
  // permission / error states own the screen instead of an empty shell.
  const syncBlocked = status === "needs-permission" || status === "unsupported" || status === "error";
  const hasLocalData = readModel !== null && (readModel.totalActivityCount > 0 || readModel.accounts.length > 0);
  const showDashboardShell = readModel !== null && (!syncBlocked || hasLocalData);
  const showReadModelError = readModel === null && readModelError !== null;
  // While a currency switch loads, the previous currency's model stays on
  // screen (keepPrevious) — the chart must not relabel those numbers.
  const isCashflowCurrencyReady = readModel !== null && readModel.currency === loadCurrency;
  const subscriptionPreviewItems = scopedAccountId ? [] : displayHomeData.subscriptions.items;

  const openActivityDetail = (item: HomeActivityViewItem) => {
    router.push(buildActivityDetailRoute(item));
  };

  const openTransactionDetail = (transactionId: string) => {
    router.push(buildTransactionDetailRoute(transactionId));
  };

  // A category filter belongs to the account it was picked under, so a new
  // account starts from "all" — reset where the change happens, not in an
  // effect that renders the stale filter once first.
  const selectAccount = (key: string) => {
    setSelectedAccountKey(key);
    setSelectedFilter("all");
  };

  const hasAccounts = homeData.accounts.length > 0;
  const scopedAccountKey = homeData.accounts.some((account) => account.key === selectedAccountKey)
    ? selectedAccountKey
    : ALL_ACCOUNTS_KEY;

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.muted}
            colors={[colors.ink]}
          />
        }
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 + tabBarClearance }}
        showsVerticalScrollIndicator={false}
      >
        <LargeTitle title={homeData.displayName} subtitle={homeData.greeting} topInset={insets.top} />

        {/* Balance hero — the one number Home leads with, with the account
            scope right under it so "which money is this?" is answered in
            place. */}
        <View className="mt-5 rounded-card bg-card px-5 pb-4 pt-5">
          <Text className="text-caption font-medium text-muted">
            {scopedAccountKey === ALL_ACCOUNTS_KEY ? "Total balance" : "Balance"}
          </Text>
          {isLoading ? (
            <Delayed minHeight={64}>
              <SkeletonBlock className="mt-3 h-10 w-48" />
              <SkeletonBlock className="mt-2.5 h-3.5 w-32" />
            </Delayed>
          ) : hasAccounts ? (
            <>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                className="mt-1 text-hero text-ink"
                style={{ fontFamily: moneyFontFamily("bold"), letterSpacing: -1 }}
              >
                {scopedHeroBalance(homeData.accounts, scopedAccountKey)}
              </Text>
              <Text className="mt-0.5 text-caption text-muted">
                {accountScopeCaption(homeData.accounts, scopedAccountKey)}
              </Text>
              {showDashboardShell && readModel ? (
                <View className="mt-4">
                  <AccountScopeChips
                    accounts={homeData.accounts}
                    selectedKey={scopedAccountKey}
                    onSelect={selectAccount}
                    onOpenMore={() => router.push("/cards")}
                  />
                </View>
              ) : null}
            </>
          ) : (
            <>
              <Text className="mt-1 text-title font-semibold text-ink">No balance yet</Text>
              <Text className="mt-1 text-caption text-muted">
                Balances appear once a bank message reports one.
              </Text>
            </>
          )}
        </View>

        <HomePermissionCard hasData={hasLocalData} />

        {showReadModelError ? (
          <View className="mt-4 rounded-card bg-card">
            <ErrorState compact title="Couldn't load Home" body={readModelError} onRetry={reloadReadModel} />
          </View>
        ) : null}

        {isLoading ? (
          <View className="mt-6 gap-6">
            <SkeletonHero />
            <SkeletonRows count={4} />
          </View>
        ) : null}

        {showDashboardShell && readModel ? (
          <>
            <HomeHighlightsPanel
              status={highlightsStatus}
              error={highlightsError}
              highlights={highlights}
              afterToday={
                isCashflowCurrencyReady ? (
                  <Section title="This week">
                    <CashflowCard
                      data={displayHomeData.cashflow}
                      selectedCurrency={loadCurrency}
                      onSelectCurrency={setExplicitCurrency}
                      isScopeRefreshing={isCashflowScopeRefreshing}
                    />
                  </Section>
                ) : null
              }
              subscriptionPreviewItems={subscriptionPreviewItems}
              onRetry={reloadHighlights}
              onSeeActivity={() => router.navigate("/activity")}
              onOpenUpcoming={() => router.push("/subscriptions")}
              onOpenSubscriptions={() => router.push("/subscriptions")}
              onSelectTransaction={openTransactionDetail}
            />

            <EnterTransition index={3}>
              <Section title="Budget">
                <HomeBudgetCard
                  currency={loadCurrency}
                  monthLabel={displayHomeData.budget.monthLabel}
                  monthSpent={displayHomeData.budget.spent}
                />
              </Section>
            </EnterTransition>

            <EnterTransition index={4}>
              <ActivitySection
                activity={homeDataForSection.activity}
                onSeeAll={() => router.navigate("/activity")}
                onSelect={openActivityDetail}
                selectedFilter={selectedFilter}
                onFilterChange={setSelectedFilter}
                activityStatus={activityQueryStatus}
                activityError={activityQueryError}
                onRetry={reloadActivity}
              />
            </EnterTransition>
          </>
        ) : null}
      </ScrollView>

      {/* Stays mounted so it animates open and closed; its content only
          renders once opened (NativeBottomSheet), so idle cost is small. */}
      <NewTransactionsDialog
        transactions={newTransactionSummaries}
        total={newTransactionTotal}
        onDismiss={dismissCaughtUp}
      />
    </View>
  );
}
