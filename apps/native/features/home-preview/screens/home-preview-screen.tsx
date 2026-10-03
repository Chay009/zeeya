import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "@/components/app-text";
import { Art, hasArt } from "@/components/art/art";
import { HeroSurface } from "@/components/surfaces/hero-surface";
import { HeroAmount } from "@/components/ui/hero-amount";
import { useFloatingTabBarClearance } from "@/components/floating-tab-bar";
import { EnterTransition } from "@/components/native-ui/enter-transition";
import { useToday } from "@/lib/today";
import { LargeTitle } from "@/components/ui/header";
import { Section } from "@/components/ui/section";
import { Delayed, ErrorState, SkeletonHero, SkeletonRows } from "@/components/ui/states";

import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";
import { useHomeRecentActivity } from "@/features/dashboard/hooks/home-recent-activity";
import type { ActivityCategoryFilter } from "@/lib/activity-filters";

import {
  ALL_ACCOUNTS_KEY,
  accountScopeCaption,
  resolveScopedAccountId,
  scopedHeroBalance,
} from "../account-scope";
import { AccountTiles, TILE_INSET } from "../components/account-tiles";
import { HomeShortcuts } from "../components/home-shortcuts";
import { ActivitySection } from "../components/activity-section";
import { BudgetAlertResponder } from "@/features/budgets/components/budget-alert-responder";
import { HomeBudgetCard } from "@/features/budgets/components/home-budget-card";
import { useMessageInsights } from "@/features/insights/hooks/use-message-insights";
import { deriveActionItems } from "@/lib/action-center";
import { ActionCenter } from "../components/action-center";
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
import { useThemeColors, withAlpha } from "@/components/ui/theme";
import { useHomeAccountCashflowScope } from "../hooks/use-home-account-cashflow-scope";
import { useHomeActivityScope } from "../hooks/use-home-activity-scope";
import { useHomeData } from "../hooks/use-home-data";
import { useHomeHighlights } from "../hooks/use-home-highlights";
import { useHomeScreenModel } from "../hooks/use-home-screen-model";

// The wallet stands inside the balance card beside the number, its base
// tucked below the balance block and under the account tiles (which start
// 20pt below it, are opaque and drawn after it) — so it sits behind them. It
// hangs 24pt past the card's right edge, which clips it — so the balance
// keeps its full 44pt instead of being auto-shrunk to fit beside a whole
// wallet. The art is square with the wallet centred in it (wider than tall:
// 14.5% empty above and below), so its placement is derived from its size,
// which scales with the screen.
const WALLET_EMPTY_BELOW = 0.145;
const WALLET_TUCK = 34;
// How far the wallet's right edge sits past the card's 20pt padding edge
// (20 + 24 = 24pt past the card itself).
const WALLET_OVERHANG = 44;
const WALLET_GAP = 4;

function walletLayout(windowWidth: number, tucked: boolean) {
  const size = Math.round(Math.min(132, Math.max(120, windowWidth * 0.35)));
  return {
    size,
    // Without tiles there is nothing to tuck under: it rests on the block.
    tuck: (tucked ? WALLET_TUCK : 0) + Math.round(size * WALLET_EMPTY_BELOW),
    // The room the balance leaves it: the part of its width inside the
    // padding edge, plus a small gap.
    clearance: size - WALLET_OVERHANG + WALLET_GAP,
  };
}

export function HomePreviewScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const tabBarClearance = useFloatingTabBarClearance();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  // Only the sync fields Home renders. Per-page scan progress is read by
  // HomePermissionCard itself, so a running sync never re-renders Home.
  const { status, caughtUpTransactions, dismissCaughtUp, refreshing, onRefresh } = useDashboardSync(
    (state) => ({
      status: state.status,
      caughtUpTransactions: state.caughtUpTransactions,
      dismissCaughtUp: state.dismissCaughtUp,
      refreshing: state.refreshing,
      onRefresh: state.onRefresh,
    }),
  );

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
  const { insights: messageInsights } = useMessageInsights(loadCurrency);
  // Re-ranked when the facts change or the day turns; `today` is a dep so a
  // bill due "tomorrow" becomes "today" at midnight.
  const actionItems = useMemo(
    () => deriveActionItems(messageInsights, new Date()),
    [messageInsights, today],
  );
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
  const syncBlocked =
    status === "needs-permission" || status === "unsupported" || status === "error";
  const hasLocalData =
    readModel !== null && (readModel.totalActivityCount > 0 || readModel.accounts.length > 0);
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
  const showAccountTiles = hasAccounts && !isLoading && showDashboardShell && readModel !== null;
  const wallet = hasArt("hero-wallet") ? walletLayout(windowWidth, showAccountTiles) : null;

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
        <LargeTitle
          title={homeData.displayName}
          subtitle={homeData.greeting}
          topInset={insets.top}
        />

        {/* Balance hero — the one number Home leads with, today's movement
            under it, and the account scope right below. The wallet is drawn
            before the account tiles, so the tiles cover its base and it sits
            behind them. */}
        <View className="mt-4">
          <HeroSurface glowAt={{ x: 0.86, y: 0.42 }}>
            {/* With account tiles the card's bottom padding matches the tile
                row's 12pt inset, so the tiles sit in an even tray. */}
            <View
              className="px-5 pt-5"
              style={{ paddingBottom: showAccountTiles ? TILE_INSET : 20 }}
            >
              <View style={{ marginRight: wallet?.clearance ?? 0 }}>
                {wallet ? (
                  <View
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      right: -wallet.clearance - WALLET_OVERHANG,
                      bottom: -wallet.tuck,
                    }}
                  >
                    <Art name="hero-wallet" size={wallet.size} />
                  </View>
                ) : null}
                <Text className="text-caption font-medium" style={{ color: colors.onHeroMuted }}>
                  {scopedAccountKey === ALL_ACCOUNTS_KEY ? "Total balance" : "Balance"}
                </Text>
                {isLoading ? (
                  <Delayed minHeight={64}>
                    <View
                      className="mt-3 h-10 w-44 rounded-lg"
                      style={{ backgroundColor: withAlpha(colors.onHero, 0.08) }}
                    />
                    <View
                      className="mt-2.5 h-3.5 w-28 rounded"
                      style={{ backgroundColor: withAlpha(colors.onHero, 0.06) }}
                    />
                  </Delayed>
                ) : hasAccounts ? (
                  <>
                    <View className="mt-1">
                      <HeroAmount
                        label={scopedHeroBalance(homeData.accounts, scopedAccountKey)}
                        color={colors.onHero}
                        mutedColor={colors.onHeroMuted}
                        size={44}
                      />
                    </View>
                    <Text className="mt-1 text-meta" style={{ color: colors.onHeroMuted }}>
                      {accountScopeCaption(homeData.accounts, scopedAccountKey)}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text
                      className="mt-1 text-title font-semibold"
                      style={{ color: colors.onHero }}
                    >
                      No balance yet
                    </Text>
                    <Text className="mt-1 text-caption" style={{ color: colors.onHeroMuted }}>
                      Balances appear once a bank message reports one.
                    </Text>
                  </>
                )}
              </View>
              {showAccountTiles ? (
                <View className="mt-5">
                  <AccountTiles
                    accounts={homeData.accounts}
                    selectedKey={scopedAccountKey}
                    totalLabel={scopedHeroBalance(homeData.accounts, ALL_ACCOUNTS_KEY)}
                    onSelect={selectAccount}
                  />
                </View>
              ) : null}
            </View>
          </HeroSurface>
        </View>

        {showDashboardShell ? <HomeShortcuts /> : null}

        {/* What needs attention now — renders nothing on a quiet day. */}
        {showDashboardShell ? (
          <ActionCenter
            items={actionItems}
            currency={loadCurrency}
            onOpenBills={() => router.push("/subscriptions")}
          />
        ) : null}

        <HomePermissionCard hasData={hasLocalData} />

        {showReadModelError ? (
          <View className="mt-4 rounded-card bg-card">
            <ErrorState
              compact
              title="Couldn't load Home"
              body={readModelError}
              onRetry={reloadReadModel}
            />
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
                  <>
                    <Section title="This week">
                      <CashflowCard
                        data={displayHomeData.cashflow}
                        selectedCurrency={loadCurrency}
                        onSelectCurrency={setExplicitCurrency}
                        isScopeRefreshing={isCashflowScopeRefreshing}
                      />
                    </Section>
                  </>
                ) : null
              }
              subscriptionPreviewItems={subscriptionPreviewItems}
              onRetry={reloadHighlights}
              onSeeActivity={() => router.navigate("/activity")}
              onOpenUpcoming={() => router.push("/subscriptions")}
              onOpenSubscriptions={() => router.push("/subscriptions")}
              onSelectTransaction={openTransactionDetail}
              bills={messageInsights.billsDue}
            />

            <EnterTransition index={3}>
              {/* No heading: the card's own "September · 3 budgets ›" label
                  names it, so a "Budget" title would say it twice. */}
              <Section>
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

      {/* Home is the first screen and stays mounted, so a budget alert tap
          (even the one that launched the app) always has a listener. */}
      <BudgetAlertResponder />

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
