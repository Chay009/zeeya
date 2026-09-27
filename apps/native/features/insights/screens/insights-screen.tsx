import { useRouter } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useFloatingTabBarClearance } from "@/components/floating-tab-bar";
import { TransactionRow } from "@/components/finance/transaction-row";
import { EnterTransition } from "@/components/native-ui/enter-transition";
import { IconTile, Segmented, SelectPill } from "@/components/ui/controls";
import { LargeTitle } from "@/components/ui/header";
import { Row, RowGroup } from "@/components/ui/list";
import { Section } from "@/components/ui/section";
import { EmptyState, ErrorState, SkeletonHero, SkeletonRows } from "@/components/ui/states";
import { useThemeColors } from "@/components/ui/theme";
import { buildTransactionDetailRoute } from "@/features/home-preview/detail-route";

import { formatAnalyticsPeriod } from "../analytics-format";
import { INSIGHTS_TIME_SCOPES, type AnalyticsTab, type InsightsTimeScope } from "../analytics-scope";
import {
  categoryTransactionFocus,
  vendorTransactionFocus,
  type AnalyticsTransactionFocus,
} from "../analytics-transaction-focus";
import { AnalyticsBreakdownCard } from "../components/analytics-breakdown-card";
import { AnalyticsBudgetCard } from "../components/analytics-budget-card";
import {
  AnalyticsDetailSheets,
  type AnalyticsDetailSheet,
} from "../components/analytics-detail-sheets";
import { AnalyticsHeroCard } from "../components/analytics-hero-card";
import { useInsightsScreen } from "../hooks/use-insights-screen";

// Analytics: header filters → one hero (the number + its shape) → where it
// went → what repeats → the evidence. Detail lives in sheets so the screen
// itself stays a calm overview.
//
// TODO(analytics-detail): the legacy panels in ../components
// (insights-overview*, category-panel, transactions-panel,
// analytics-series-panel, analytics-summary, spending-summary-tiles, …) are
// kept on purpose — they're the building blocks for the planned detailed
// analytics section (category drill-down, merchant pages, trends). Rebuild
// them on components/ui when that section lands.

const RECENT_LIMIT = 5;

export function InsightsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarClearance = useFloatingTabBarClearance();
  const router = useRouter();
  const colors = useThemeColors();
  const screen = useInsightsScreen();
  const [activeSheet, setActiveSheet] = useState<AnalyticsDetailSheet>(null);
  const [transactionFocus, setTransactionFocus] = useState<AnalyticsTransactionFocus>(null);
  const [transactionFocusKey, setTransactionFocusKey] = useState(0);

  const openSheet = (sheet: AnalyticsDetailSheet, focus?: AnalyticsTransactionFocus) => {
    if (sheet === "transactions") {
      setTransactionFocus(focus ?? null);
      setTransactionFocusKey((key) => key + 1);
    }
    setActiveSheet(sheet);
  };

  const tab = screen.effectiveTab;
  const mode = tab === "income" ? "income" : "spending";
  const tabOptions: { value: AnalyticsTab; label: string }[] = [
    { value: "outcome", label: "Spending" },
    { value: "income", label: "Income" },
    ...(screen.showBudget ? [{ value: "budget" as const, label: "Budget" }] : []),
  ];
  const isFirstLoad = screen.isOverviewLoading && !screen.presentation;
  const recent = screen.transactions.slice(0, RECENT_LIMIT);
  const subscriptions = screen.presentation?.subscriptions;

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={screen.refreshing}
            onRefresh={screen.refresh}
            tintColor={colors.muted}
            colors={[colors.ink]}
          />
        }
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: tabBarClearance + 8 }}
        showsVerticalScrollIndicator={false}
      >
        <LargeTitle
          title="Analytics"
          subtitle={formatAnalyticsPeriod(screen.atDate)}
          topInset={insets.top}
          right={
            <>
              {screen.currencies.length > 1 ? (
                <SelectPill
                  value={screen.currency}
                  options={screen.currencies.map((code) => ({ value: code, label: code }))}
                  onChange={screen.setSelectedCurrency}
                  accessibilityLabel={`Currency ${screen.currency}`}
                />
              ) : null}
              {tab !== "budget" ? (
                <SelectPill
                  value={screen.timeScope}
                  options={INSIGHTS_TIME_SCOPES.map((item) => ({ value: item.value, label: item.label }))}
                  onChange={(next) => screen.setTimeScope(next as InsightsTimeScope)}
                  icon="calendar"
                  accessibilityLabel="Time range"
                />
              ) : null}
            </>
          }
        />

        <Segmented
          value={tab}
          options={tabOptions}
          onChange={screen.setTabSelection}
          className="mt-5"
        />

        <View className="mt-4">
          {screen.overviewStatus === "error" && !screen.presentation ? (
            <View className="rounded-card bg-card">
              <ErrorState body={screen.overviewError} onRetry={screen.reloadOverview} />
            </View>
          ) : isFirstLoad ? (
            <SkeletonHero />
          ) : tab === "budget" ? (
            screen.presentation?.budget ? (
              <EnterTransition index={0}>
                <AnalyticsBudgetCard budget={screen.presentation.budget} currency={screen.currency} />
              </EnterTransition>
            ) : (
              <View className="rounded-card bg-card">
                <EmptyState icon="pie-chart" title="No budget yet" body="Set a monthly limit to see your pace here." />
              </View>
            )
          ) : (
            <EnterTransition index={0}>
              {/* Not keyed by tab/range/currency: that remounted the Skia
                  canvas and replayed its reveal on every switch. Kept
                  mounted, the chart morphs to the new series instead. */}
              <AnalyticsHeroCard
                mode={mode}
                scope={screen.timeScope}
                currency={screen.currency}
                comparison={screen.comparison}
                dailySeries={screen.dailySeries}
                monthlySeries={screen.monthlySeries}
                at={screen.atDate}
                error={screen.chartError}
                onRetry={screen.retrySeries}
              />
            </EnterTransition>
          )}
        </View>

        {tab === "outcome" && !isFirstLoad ? (
          <EnterTransition index={1}>
            <Section title={screen.timeScope === "month" ? "Where it went" : "Where it went this month"}>
              <AnalyticsBreakdownCard
                categories={screen.categories}
                categoryTotal={screen.categoryTotal}
                presentation={screen.presentation}
                currency={screen.currency}
                onOpenCategory={(category) => openSheet("transactions", categoryTransactionFocus(category))}
                onOpenMerchant={(merchant) => openSheet("transactions", vendorTransactionFocus(merchant))}
                onSeeAll={(lens) => openSheet(lens === "categories" ? "categories" : "vendors")}
              />
            </Section>
          </EnterTransition>
        ) : null}

        {tab === "outcome" && subscriptions && subscriptions.activeCount > 0 ? (
          <EnterTransition index={2}>
            <Section title="Recurring">
              <RowGroup>
                <Row
                  onPress={() => openSheet("subscriptions")}
                  leading={<IconTile icon="repeat" color={colors.accentDeep} background={colors.accentSoft} />}
                  title={`${screen.committedMonthlySpend ?? ""} a month`}
                  subtitle={`${subscriptions.activeCount} active subscription${subscriptions.activeCount === 1 ? "" : "s"}`}
                  chevron
                />
              </RowGroup>
            </Section>
          </EnterTransition>
        ) : null}

        {tab !== "budget" ? (
          <EnterTransition index={3}>
            <Section
              title={tab === "income" ? "Recent income" : "Recent spending"}
              actionLabel={recent.length > 0 ? "See all" : undefined}
              onAction={() => openSheet("transactions")}
            >
              {screen.transactionsStatus === "loading" && recent.length === 0 ? (
                <SkeletonRows count={3} />
              ) : screen.transactionsStatus === "error" && recent.length === 0 ? (
                <View className="rounded-card bg-card">
                  <ErrorState compact body={screen.transactionsError} onRetry={screen.reloadTransactions} />
                </View>
              ) : recent.length === 0 ? (
                <View className="rounded-card bg-card">
                  <EmptyState compact icon="receipt" title="Nothing here yet" />
                </View>
              ) : (
                <RowGroup>
                  {recent.map((item) => (
                    <TransactionRow
                      key={item.key}
                      name={item.name}
                      subtitle={item.category || item.sub}
                      meta={new Date(item.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      logo={item}
                      amount={item.amountValue}
                      amountLabel={item.amount}
                      currency={item.currency ?? screen.currency}
                      direction={item.direction ?? (tab === "income" ? "income" : "expense")}
                      onPress={() => router.push(buildTransactionDetailRoute(item.key))}
                    />
                  ))}
                </RowGroup>
              )}
            </Section>
          </EnterTransition>
        ) : null}
      </ScrollView>

      <AnalyticsDetailSheets
        activeSheet={activeSheet}
        onActiveSheetChange={setActiveSheet}
        at={screen.atDate}
        tab={tab}
        presentation={screen.presentation}
        categories={screen.categories}
        categoryTotal={screen.categoryTotal}
        isCategoryLoading={screen.isCategoryLoading}
        currency={screen.currency}
        direction={screen.direction}
        transactions={screen.transactions}
        transactionsStatus={screen.transactionsStatus}
        transactionsError={screen.transactionsError}
        onReloadTransactions={screen.reloadTransactions}
        onOpenTransactions={(focus) => openSheet("transactions", focus)}
        transactionFocus={transactionFocus}
        transactionFocusKey={transactionFocusKey}
        timeScope={screen.timeScope}
        currencies={screen.currencies}
        onScopeChange={(scope: InsightsTimeScope) => screen.setTimeScope(scope)}
        onCurrencyChange={screen.setSelectedCurrency}
        onSelectTransaction={(item) => router.push(buildTransactionDetailRoute(item.key))}
      />
    </View>
  );
}
