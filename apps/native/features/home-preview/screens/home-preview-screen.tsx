import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "@/components/app-text";
import { useFloatingTabBarClearance } from "@/components/floating-tab-bar";
import { EnterTransition } from "@/components/native-ui/enter-transition";
import { moneyFontFamily } from "@/lib/fonts";
import { LargeTitle } from "@/components/ui/header";
import { Section } from "@/components/ui/section";
import { ErrorState } from "@/components/ui/states";

import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";
import { useHomeReadModel } from "@/features/dashboard/hooks/home-read-model";
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
import { BudgetCard } from "../components/budget-card";
import { CashflowCard } from "../components/cashflow-card";
import { HomePermissionCard } from "../components/home-permission-card";
import { HomeHighlightsPanel } from "../components/home-highlights-panel";
import { NewTransactionsDialog } from "../components/new-transactions-dialog";
import {
  buildActivityDetailRoute,
  buildTransactionDetailRoute,
  createHomePreviewDataFromReadModel,
  summarizeCaughtUpTransactions,
  summarizeNewTransactions,
  type HomeActivityViewItem,
} from "../data";
import { useThemeColors } from "@/components/ui/theme";
import { useHomeAccountCashflowScope } from "../hooks/use-home-account-cashflow-scope";
import { useHomeActivityScope } from "../hooks/use-home-activity-scope";
import { useHomeHighlights } from "../hooks/use-home-highlights";
import { useHomeScreenModel } from "../hooks/use-home-screen-model";


export function HomePreviewScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const tabBarClearance = useFloatingTabBarClearance();
  const router = useRouter();
  // Sync/permission/progress still comes from useDashboardSync — the
  // bounded read-model path doesn't change any of that surface, only what
  // Home's body renders. dashboard/aggregates are no longer needed here
  // and are intentionally not destructured — Home's own data comes from
  // useHomeReadModel instead.
  const {
    status,
    error,
    progress,
    newSinceLastView,
    caughtUpTransactions,
    dismissNewSinceLastView,
    connect,
    refreshing,
    onRefresh,
    syncRevision,
  } = useDashboardSync();

  // The chart selector's own sticky choice — what currency the user last
  // asked to view, between renders. The hook below uses this as its
  // initial guess, then once the read model lands its own
  // availableCurrencies[0] (primary-first ordering from SQL) becomes the
  // effective fallback for a USD-only user that has nothing else selected.
  const [cashflowCurrencySticky, setCashflowCurrency] = useState<string | undefined>(undefined);
  // explicitCurrency overrides cashflowCurrencySticky once the user has
  // explicitly picked something in this session — separated from the
  // sticky state so the user's last choice survives even when the
  // chart selector isn't actively being shown (e.g. on a future
  // re-mount of this screen).
  const [explicitCurrency, setExplicitCurrency] = useState<string | undefined>(undefined);
  // First load: no chart selector yet, no model yet — just fall back to
  // INR. useHomeReadModel reads initialLoadCurrency only on its first
  // effect; subsequent renders cannot feed a new value back in (that
  // would re-issue a fetch every time the user merely scrolls past the
  // chart's currency selector). The model's own primary currency, once
  // it lands, is adopted via a separate one-shot secondary load below —
  // not by re-running the original effect.
  const initialLoadCurrency = explicitCurrency ?? cashflowCurrencySticky ?? "INR";
  const {
    model: readModel,
    status: readModelStatus,
    error: readModelError,
    reload: reloadReadModel,
  } = useHomeReadModel(initialLoadCurrency);
  const hasAdoptedPrimary = useRef(false);
  // Adopt the model's primary available currency once it lands, so a
  // USD-only user isn't stuck on an empty INR-scoped view until they
  // manually switch. explicitCurrency (set by the chart selector) wins
  // over cashflowCurrencySticky (the user's prior choice between renders)
  // and the model's own primary-first ordering — only when neither is set
  // do we adopt the model's primary currency, and we do it via a one-shot
  // reload (not by feeding loadCurrency back into the original hook
  // effect, which would race every render).
  const loadCurrency =
    explicitCurrency ??
    cashflowCurrencySticky ??
    readModel?.availableCurrencies[0] ??
    initialLoadCurrency;
  const highlightsAt = useMemo(() => Date.now(), [syncRevision]);
  const [selectedFilter, setSelectedFilter] = useState<ActivityCategoryFilter>("all");
  const [selectedAccountKey, setSelectedAccountKey] = useState(ALL_ACCOUNTS_KEY);
  const modelPrimary = readModel?.availableCurrencies[0];
  const adoptedPrimary =
    !hasAdoptedPrimary.current &&
    explicitCurrency == null &&
    cashflowCurrencySticky == null &&
    modelPrimary !== undefined &&
    modelPrimary !== initialLoadCurrency;

  // One-shot: the very first time the model returns a primary currency
  // different from what we initially loaded with AND the user hasn't yet
  // picked anything, adopt it via reload. The ref latch also makes this
  // permanently false after the automatic adoption itself, so the successful
  // adopted load cannot trigger the same reload again.
  useEffect(() => {
    if (adoptedPrimary && modelPrimary !== undefined) {
      hasAdoptedPrimary.current = true;
      reloadReadModel(modelPrimary);
    }
    // adoptedPrimary is intentionally the only dep — modelPrimary is
    // captured via its enclosing closure, and the boolean recomputes
    // when either input changes; depending on the boolean directly avoids
    // a redundant fire whenever modelPrimary just happens to flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adoptedPrimary]);

  // While the read model is loading or has errored, fall back to an empty
  // model so the presentation builder has a consistent shape to render
  // (every field is either an empty array, a single entry, or "—"). The
  // legacy hasRealData/aggregates boundary is gone — there is no separate
  // aggregates source, since HomeReadModel already carries
  // monthTotals/categoryTotalsByCurrency inside the same snapshot as
  // everything else (see HomeReadModel's own top comment in
  // lib/dashboard-data.ts).
  const fallbackModel = useMemo(
    () => ({
      currency: loadCurrency,
      accounts: [],
      detectedAccounts: [],
      unassignedReadings: [],
      monthTotals: { incomeByCurrency: {}, expenseByCurrency: {} },
      categoryTotalsByCurrency: {},
      availableCurrencies: readModel?.availableCurrencies ?? [],
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
    }),
    [loadCurrency, readModel?.availableCurrencies],
  );
  const homeData = useMemo(
    () =>
      createHomePreviewDataFromReadModel(
        readModel ?? fallbackModel,
        status === "ready" && readModel !== null,
        new Date(),
      ),
    [readModel, fallbackModel, status],
  );

  const scopedAccountId = resolveScopedAccountId(homeData.accounts, selectedAccountKey);
  const needsAuxiliaryActivity = scopedAccountId !== undefined || selectedFilter !== "all";
  const highlightsQuery = useMemo(
    () => ({ currency: loadCurrency, at: highlightsAt, accountId: scopedAccountId }),
    [highlightsAt, loadCurrency, scopedAccountId],
  );
  const {
    highlights,
    status: highlightsStatus,
    error: highlightsError,
    reload: reloadHighlights,
  } = useHomeHighlights(highlightsQuery);
  const { scope: activityScope, status: activityScopeStatus } =
    useHomeActivityScope(scopedAccountId);
  const cashflowScope = useHomeAccountCashflowScope(scopedAccountId, loadCurrency, highlightsAt);
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

  const newTransactionSummaries = useMemo(() => {
    const caughtUp = summarizeCaughtUpTransactions(caughtUpTransactions.items);
    const caughtUpIds = new Set(caughtUp.map((transaction) => transaction.key));
    return [
      ...caughtUp,
      ...summarizeNewTransactions(newSinceLastView).filter(
        (transaction) => !caughtUpIds.has(transaction.key),
      ),
    ];
  }, [caughtUpTransactions.items, newSinceLastView]);
  const caughtUpIds = new Set(caughtUpTransactions.items.map((transaction) => transaction.id));
  const newTransactionTotal =
    caughtUpTransactions.total +
    newTransactionSummaries.filter((transaction) => !caughtUpIds.has(transaction.key)).length;

  // Render the dashboard shell as soon as there's anything meaningful to
  // show structure for, rather than blocking the whole screen on a full
  // sync. The read-model path's own loading gate is independent of
  // dashboard sync's status — both must clear for the shell to render
  // real content; the skeleton fills the wait.
  const showDashboardShell =
    status !== "needs-permission" && status !== "unsupported" && status !== "error";
  const showReadModelError = readModelStatus === "error";
  const isCashflowCurrencyReady =
    readModel !== null && !adoptedPrimary && readModel.currency === loadCurrency;
  const subscriptionPreviewItems = scopedAccountId ? [] : displayHomeData.subscriptions.items;

  useEffect(() => {
    setSelectedFilter("all");
  }, [selectedAccountKey]);

  const openActivityDetail = (item: HomeActivityViewItem) => {
    router.push(buildActivityDetailRoute(item));
  };

  const openTransactionDetail = (transactionId: string) => {
    router.push(buildTransactionDetailRoute(transactionId));
  };

  // When the user picks a different currency in the Cashflow chart's own
  // selector, persist the choice and explicitly reload the read model. The
  // hook intentionally ignores later initialCurrency prop changes, so the
  // reload call is the load-bearing part of this path (including selecting
  // the currency already in view).
  const handleCashflowCurrencyChange = (currency: string) => {
    setCashflowCurrency(currency);
    setExplicitCurrency(currency);
    reloadReadModel(currency);
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
          {hasAccounts ? (
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
                    onSelect={setSelectedAccountKey}
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

        <HomePermissionCard
          status={status}
          error={error}
          progress={progress}
          onConnect={connect}
          hasData={readModel !== null}
        />

        {showReadModelError ? (
          <View className="mt-4 rounded-card bg-card">
            <ErrorState compact title="Couldn't load Home" body={readModelError} onRetry={() => reloadReadModel(loadCurrency)} />
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
                      selectedCurrency={explicitCurrency ?? displayHomeData.cashflow.selectedCurrency}
                      onSelectCurrency={handleCashflowCurrencyChange}
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
                <BudgetCard {...displayHomeData.budget} onOpen={() => router.navigate("/insights")} />
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

      <NewTransactionsDialog
        transactions={newTransactionSummaries}
        total={newTransactionTotal}
        onDismiss={dismissNewSinceLastView}
      />
    </View>
  );
}
