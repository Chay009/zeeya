import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "@/components/app-text";
import { useFloatingTabBarClearance } from "@/components/floating-tab-bar";
import { EnterTransition } from "@/components/native-ui/enter-transition";
import { headingFontFamily, moneyFontFamily } from "@/lib/fonts";

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
import { AccountEvidenceSection } from "../components/account-evidence-section";
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
import { homeSpacing, hp } from "../theme";
import { useHomeAccountCashflowScope } from "../hooks/use-home-account-cashflow-scope";
import { useHomeActivityScope } from "../hooks/use-home-activity-scope";
import { useHomeHighlights } from "../hooks/use-home-highlights";
import { useHomeScreenModel } from "../hooks/use-home-screen-model";

// The page gutter. Account chips stay inside it; Cards is opened from More.
const PAGE_PADDING = 20;

export function HomePreviewScreen() {
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

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={hp.accent}
            colors={[hp.accent]}
          />
        }
        contentContainerStyle={{
          paddingHorizontal: PAGE_PADDING,
          paddingTop: Math.max(homeSpacing.md, insets.top),
          paddingBottom: 12 + tabBarClearance,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* One line, not three. "Money overview" and "your latest activity
            at a glance" both described the screen you were already looking
            at; the greeting is the only part that says anything. No header
            buttons either — Profile is a bottom tab already. */}
        <View className="mt-3">
          <Text className="text-body text-muted-soft">{homeData.greeting}</Text>
          <Text
            numberOfLines={1}
            className="mt-0.5 text-[32px] font-bold tracking-tight text-ink"
            style={{ fontFamily: headingFontFamily("bold") }}
          >
            {homeData.displayName}
          </Text>
          {homeData.accounts.length > 0 ? (
            <>
              <Text className="mt-3 text-label font-bold uppercase tracking-wide text-muted">
                {selectedAccountKey === ALL_ACCOUNTS_KEY ? "Total balance" : "Balance"}
              </Text>
              <Text
                numberOfLines={1}
                className="mt-0.5 text-screen tracking-tight text-ink"
                style={{ fontFamily: moneyFontFamily("semibold") }}
              >
                {scopedHeroBalance(homeData.accounts, selectedAccountKey)}
              </Text>
              <Text className="mt-0.5 text-caption text-muted">
                {accountScopeCaption(homeData.accounts, selectedAccountKey)}
              </Text>
            </>
          ) : null}
        </View>

        <HomePermissionCard status={status} error={error} progress={progress} onConnect={connect} />

        {showReadModelError && (
          // Home's own read-model load failed — distinct from
          // useDashboardSync's own error surface (which can independently
          // be a permissions/unsupported/sync error above). Without an
          // explicit message here, a user with a working inbox sync but a
          // transient SQL failure would see a permanent skeleton with no
          // indication anything's wrong.
          <View className="mt-4 rounded-card bg-card p-4">
            <Text className="text-body font-bold text-ink">Couldn't load the Home view</Text>
            <Text className="mt-1 text-caption leading-[17px] text-muted-soft" numberOfLines={3}>
              {readModelError ?? "Try pulling down to refresh."}
            </Text>
          </View>
        )}

        {showDashboardShell && readModel ? (
          <>
            <EnterTransition index={0}>
              {homeData.accounts.length > 0 ? (
                <AccountScopeChips
                  accounts={homeData.accounts}
                  selectedKey={
                    homeData.accounts.some((account) => account.key === selectedAccountKey)
                      ? selectedAccountKey
                      : ALL_ACCOUNTS_KEY
                  }
                  onSelect={setSelectedAccountKey}
                  onOpenMore={() => router.push("/cards")}
                />
              ) : (
                <View className="mt-4 rounded-card bg-card p-4">
                  <Text className="text-body font-bold text-ink">No bank-reported balance yet</Text>
                  <Text className="mt-1 text-caption leading-[17px] text-muted-soft">
                    Detected identities are listed separately on the Cards tab and do not affect
                    balances.
                  </Text>
                </View>
              )}
            </EnterTransition>

            <HomeHighlightsPanel
              status={highlightsStatus}
              error={highlightsError}
              highlights={highlights}
              afterToday={
                isCashflowCurrencyReady ? (
                  <View className="mt-3">
                    <CashflowCard
                      data={displayHomeData.cashflow}
                      selectedCurrency={explicitCurrency ?? displayHomeData.cashflow.selectedCurrency}
                      onSelectCurrency={handleCashflowCurrencyChange}
                      isScopeRefreshing={isCashflowScopeRefreshing}
                    />
                  </View>
                ) : null
              }
              subscriptionPreviewItems={subscriptionPreviewItems}
              budget={displayHomeData.budget}
              onRetry={reloadHighlights}
              onSeeActivity={() => router.navigate("/activity")}
              onOpenUpcoming={() => router.navigate("/insights")}
              onOpenSubscriptions={() => router.push("/subscriptions")}
              onSelectTransaction={openTransactionDetail}
            />

            <EnterTransition index={1}>
              <View className="mt-3 gap-3">
                <BudgetCard
                  {...displayHomeData.budget}
                  onOpen={() => router.navigate("/insights")}
                />
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
              </View>
            </EnterTransition>

            {(homeData.detectedAccounts.length > 0 || homeData.unassignedReadings.length > 0) && (
              <EnterTransition index={2}>
                <AccountEvidenceSection
                  detectedAccounts={homeData.detectedAccounts}
                  unassignedReadings={homeData.unassignedReadings}
                />
              </EnterTransition>
            )}
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
