import { useRouter } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "@/components/app-text";
import { useFloatingTabBarClearance } from "@/components/floating-tab-bar";
import { EnterTransition } from "@/components/native-ui/enter-transition";
import { buildTransactionDetailRoute } from "@/features/home-preview/detail-route";
import { hp } from "@/features/home-preview/theme";
import { headingFontFamily } from "@/lib/fonts";

import { formatAnalyticsPeriod } from "../analytics-format";
import { INSIGHTS_TIME_SCOPES, scopeLabel, type InsightsTimeScope } from "../analytics-scope";
import type { AnalyticsTransactionFocus } from "../analytics-transaction-focus";
import { AnalyticsBreakdown } from "../components/analytics-breakdown";
import { AnalyticsControls, AnalyticsFilterSelect } from "../components/analytics-controls";
import {
  AnalyticsDetailSheets,
  type AnalyticsDetailSheet,
} from "../components/analytics-detail-sheets";
import { AnalyticsOverviewCard } from "../components/analytics-overview-card";
import {
  AnalyticsCategoriesPreview,
  AnalyticsTransactionsPreview,
  AnalyticsVendorsPreview,
} from "../components/analytics-preview-lists";
import { BudgetPanel } from "../components/budget-panel";
import { InsightsNotice, InsightsOverviewError } from "../components/insights-chrome";
import { useInsightsScreen } from "../hooks/use-insights-screen";

export function InsightsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarClearance = useFloatingTabBarClearance();
  const router = useRouter();
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

  const showBreakdown = screen.effectiveTab !== "budget";

  return (
    <View className="relative flex-1 bg-background">
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={screen.refreshing}
            onRefresh={screen.refresh}
            tintColor={hp.accent}
            colors={[hp.accent]}
          />
        }
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: Math.max(insets.top, 16),
          paddingBottom: tabBarClearance + 12,
          gap: 12,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center justify-between">
          <View className="min-w-0 flex-1">
            <Text
              className="text-screen font-bold tracking-tighter text-ink"
              style={{ fontFamily: headingFontFamily("bold") }}
            >
              Analytics
            </Text>
            <Text className="mt-0.5 text-caption font-semibold text-muted">
              {formatAnalyticsPeriod(screen.atDate)}
            </Text>
          </View>
          <View className="items-end gap-2">
            <AnalyticsFilterSelect
              compact
              icon="calendar"
              label={scopeLabel(screen.timeScope)}
              accessibilityLabel={`Time range ${scopeLabel(screen.timeScope)}`}
              value={screen.timeScope}
              options={INSIGHTS_TIME_SCOPES.map((item) => ({ value: item.value, label: item.label }))}
              onChange={(next) => screen.setTimeScope(next as InsightsTimeScope)}
            />
            <AnalyticsFilterSelect
              compact
              icon="rupee-receipt"
              label={screen.currency}
              accessibilityLabel={`Currency ${screen.currency}`}
              value={screen.currency}
              options={(screen.currencies.length > 0 ? screen.currencies : [screen.currency]).map(
                (code) => ({ value: code, label: code }),
              )}
              onChange={screen.setSelectedCurrency}
            />
          </View>
        </View>

        <AnalyticsControls
          tab={screen.effectiveTab}
          onTabChange={screen.setTabSelection}
          showBudget={screen.showBudget}
        />

        {screen.materialChangeNotice ? <InsightsNotice>{screen.materialChangeNotice}</InsightsNotice> : null}

        {screen.overviewStatus === "error" && !screen.presentation ? (
          <InsightsOverviewError error={screen.overviewError} onRetry={screen.reloadOverview} />
        ) : null}

        {screen.effectiveTab === "budget" && screen.presentation?.budget ? (
          <EnterTransition index={0}>
            <BudgetPanel budget={screen.presentation.budget} currency={screen.currency} />
          </EnterTransition>
        ) : screen.effectiveTab !== "budget" ? (
          <EnterTransition index={0}>
            <AnalyticsOverviewCard
              tab={screen.effectiveTab}
              direction={screen.direction}
              scope={screen.timeScope}
              comparison={screen.comparison}
              currency={screen.currency}
              dailySeries={screen.dailySeries}
              monthlySeries={screen.monthlySeries}
              error={screen.chartError}
              onRetry={screen.retrySeries}
              at={screen.atDate}
            />
          </EnterTransition>
        ) : null}

        {showBreakdown ? (
          <EnterTransition index={1}>
            <AnalyticsBreakdown
              mode={screen.effectiveTab}
              subscriptionLabel={screen.committedMonthlySpend}
              onOpenSubscriptions={() => openSheet("subscriptions")}
              onSeeAll={(view) =>
                openSheet(view === "categories" ? "categories" : view === "merchants" ? "vendors" : "transactions")
              }
              categories={
                <AnalyticsCategoriesPreview
                  bare
                  categories={screen.categories}
                  currency={screen.currency}
                  total={screen.categoryTotal}
                  presentation={screen.presentation}
                  onSeeAll={() => openSheet("categories")}
                />
              }
              merchants={
                <AnalyticsVendorsPreview
                  bare
                  presentation={screen.presentation}
                  currency={screen.currency}
                  onSeeAll={() => openSheet("vendors")}
                />
              }
              activity={
                <AnalyticsTransactionsPreview
                  bare
                  direction={screen.direction}
                  items={screen.transactions}
                  status={screen.transactionsStatus}
                  error={screen.transactionsError}
                  onRetry={screen.reloadTransactions}
                  onSeeAll={() => openSheet("transactions")}
                  onSelect={(item) => router.push(buildTransactionDetailRoute(item.key))}
                />
              }
            />
          </EnterTransition>
        ) : null}
      </ScrollView>

      <AnalyticsDetailSheets
        activeSheet={activeSheet}
        onActiveSheetChange={setActiveSheet}
        at={screen.atDate}
        tab={screen.effectiveTab}
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
