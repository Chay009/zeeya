import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "@/components/app-text";
import { SoftBarChart } from "@/components/charts/soft-bar-chart";
import { SpendingRing } from "@/components/charts/spending-ring";
import { LedgerRow } from "@/components/finance/ledger-row";
import { useFloatingTabBarClearance } from "@/components/floating-tab-bar";
import { AppIcon } from "@/components/icon";
import { Card } from "@/components/ui/card";
import { Segmented, SelectPill } from "@/components/ui/controls";
import { HeroAmount } from "@/components/ui/hero-amount";
import { SheetLinkCard } from "@/components/ui/layered";
import { moneyLabel } from "@/components/ui/money";
import { EmptyState, ErrorState, SkeletonHero, SkeletonRows } from "@/components/ui/states";
import { useThemeColors } from "@/components/ui/theme";
import { BrandLogo } from "@/features/home-preview/components/brand-logo";
import { buildTransactionDetailRoute } from "@/features/home-preview/detail-route";
import { fromMinorUnits } from "@/lib/currency";
import { headingFontFamily } from "@/lib/fonts";

import { formatMonthToDate, formatPreviousMonthToDate } from "../analytics-format";
import type { AnalyticsTab } from "../analytics-scope";
import {
  categoryTransactionFocus,
  vendorTransactionFocus,
  type AnalyticsTransactionFocus,
} from "../analytics-transaction-focus";
import { AnalyticsBudgetCard } from "../components/analytics-budget-card";
import {
  AnalyticsDetailSheets,
  type AnalyticsDetailSheet,
} from "../components/analytics-detail-sheets";
import { CategoryChangeList, rankColor, VendorRankList } from "../components/analytics-overview";
import { HighlightsGrid, type Highlight } from "../components/highlights-grid";
import { IncomeSourcesList } from "../components/income-sources";
import { DeltaPill, LogoStack, MiniBars } from "../components/kpi-visuals";
import { MessageInsightsSection } from "../components/message-insight-cards";
import { useInsightsScreen } from "../hooks/use-insights-screen";
import { useMessageInsights } from "../hooks/use-message-insights";

// Analytics, kept simple: a light page of white cards, each one clearly named
// thing with its title inside (the reference dashboard's grouping).
//   Income · Outcome · Budget
//   The number — "Spent so far · 1–3 Oct", the change vs the same days last
//     month, and a chart: "This month" (a bar per day) or "6 months" (a bar
//     per month). Tap a bar: its value shows above it and the number follows.
//   Highlights — the month's KPIs; shares as rings, not bars.
//   Where it went — categories / merchants, each mark inside its share ring.
//   Spending — the ring of categories with in · out · net.
//   Latest — the newest payments.
//   From your messages — how you paid (rings), card credit, cashback, funds.
// Colour carries meaning: each category keeps one distinct colour wherever
// it appears; grey is context; the bar being read is solid.
//
// TODO(analytics-detail): the legacy panels in ../components
// (insights-overview*, category-panel, transactions-panel,
// analytics-series-panel, analytics-summary, spending-summary-tiles, …) are
// kept on purpose — they're the building blocks for the planned detailed
// analytics section. Rebuild them on components/ui when that section lands.

const RECENT_LIMIT = 4;
const RING_SEGMENTS = 4;
const WHERE_LIMIT = 4;

function monthName(monthStart: number): string {
  return new Date(monthStart).toLocaleDateString("en-IN", { month: "long" });
}

export function InsightsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarClearance = useFloatingTabBarClearance();
  const router = useRouter();
  const colors = useThemeColors();
  const screen = useInsightsScreen();
  const message = useMessageInsights(screen.currency);
  const [activeSheet, setActiveSheet] = useState<AnalyticsDetailSheet>(null);
  const [transactionFocus, setTransactionFocus] = useState<AnalyticsTransactionFocus>(null);
  const [transactionFocusKey, setTransactionFocusKey] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [whereLens, setWhereLens] = useState<"categories" | "merchants">("categories");
  const clearSelection = () => {
    setSelectedMonth(null);
    setSelectedDay(null);
  };

  const openSheet = (sheet: AnalyticsDetailSheet, focus?: AnalyticsTransactionFocus) => {
    if (sheet === "transactions") {
      setTransactionFocus(focus ?? null);
      setTransactionFocusKey((key) => key + 1);
    }
    setActiveSheet(sheet);
  };

  const tab = screen.effectiveTab;
  const isIncome = tab === "income";
  // The design's order: Income · Outcome · Budget (Budget once one exists).
  const tabOptions: { value: AnalyticsTab; label: string }[] = [
    { value: "income", label: "Income" },
    { value: "outcome", label: "Outcome" },
    ...(screen.showBudget ? [{ value: "budget" as const, label: "Budget" }] : []),
  ];
  const isFirstLoad = screen.isOverviewLoading && !screen.presentation;
  const presentation = screen.presentation;
  const currency = screen.currency;
  const money = (minorUnits: number) => moneyLabel(fromMinorUnits(minorUnits, currency), currency);

  const isMonth = screen.timeScope === "month";
  const verb = isIncome ? "Earned" : "Spent";

  // 6 months: one bar per month; the current month is selected until tapped.
  const bars = useMemo(
    () =>
      screen.monthlySeries.map((point) => ({
        key: String(point.monthStart),
        label: new Date(point.monthStart).toLocaleDateString("en-IN", { month: "short" }),
        value: Math.max(0, point.value),
        valueLabel: moneyLabel(Math.max(0, point.value), currency),
        isCurrent: point.isCurrent,
        monthStart: point.monthStart,
      })),
    [screen.monthlySeries, currency],
  );
  const currentBar = bars.find((bar) => bar.isCurrent) ?? bars[bars.length - 1] ?? null;
  const pickedBar = bars.find((bar) => bar.key === selectedMonth) ?? currentBar;

  // This month: one bar per day for the whole month — days still to come
  // are empty slots, so an early month reads as early, not as a few fat bars.
  const dayBars = useMemo(() => {
    const at = screen.atDate;
    const daysInMonth = new Date(at.getFullYear(), at.getMonth() + 1, 0).getDate();
    const byDate = new Map(
      screen.dailySeries.map((point) => [new Date(point.day).getDate(), point.value]),
    );
    return Array.from({ length: daysInMonth }, (_, index) => {
      const date = index + 1;
      const day = new Date(at.getFullYear(), at.getMonth(), date).getTime();
      const value = Math.max(0, byDate.get(date) ?? 0);
      return {
        key: String(day),
        day,
        label: [1, 8, 15, 22, 29].includes(date) ? String(date) : "",
        accessibilityLabel: new Date(day).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
        }),
        value,
        valueLabel: moneyLabel(value, currency),
        disabled: date > at.getDate(),
      };
    });
  }, [screen.dailySeries, screen.atDate, currency]);
  const elapsedDays = screen.atDate.getDate();
  const dailyAverage = screen.comparison.currentTotal / Math.max(1, elapsedDays);
  const pickedDayIndex = dayBars.findIndex((bar) => bar.key === selectedDay && !bar.disabled);
  const pickedDay = pickedDayIndex >= 0 ? dayBars[pickedDayIndex] : undefined;
  const runningTotal = pickedDay
    ? dayBars.slice(0, pickedDayIndex + 1).reduce((sum, bar) => sum + bar.value, 0)
    : 0;

  let headlineValue: number;
  let headlineLabel: string;
  let headlineNote: string | null = null;
  let showingCurrent = false;
  if (isMonth && pickedDay) {
    headlineValue = pickedDay.value;
    headlineLabel = `${verb} on ${pickedDay.accessibilityLabel}`;
    headlineNote = `${moneyLabel(runningTotal, currency)} by then`;
  } else if (!isMonth && pickedBar && !pickedBar.isCurrent) {
    headlineValue = pickedBar.value;
    headlineLabel = `${verb} in ${monthName(pickedBar.monthStart)}`;
  } else {
    headlineValue = screen.comparison.currentTotal;
    // Month-to-date, said plainly: "Spent so far · 1–3 Oct".
    headlineLabel = `${verb} so far · ${formatMonthToDate(screen.atDate, false)}`;
    showingCurrent = true;
  }
  const percent = screen.comparison.percentChange;
  const showDelta = showingCurrent && percent !== null && Number.isFinite(percent);

  // The ring: the top categories in their rank colours, the rest as grey.
  const categories = presentation?.topCategories ?? [];
  const spentMinorUnits = presentation?.currentMonth.spendingMinorUnits ?? 0;
  const ringTop = categories.slice(0, RING_SEGMENTS);
  const ringRest = spentMinorUnits - ringTop.reduce((sum, row) => sum + row.currentMinorUnits, 0);
  const ringSegments = [
    ...ringTop.map((row, index) => ({
      key: row.category,
      label: row.category,
      value: row.currentMinorUnits,
      color: rankColor(colors, index),
    })),
    ...(ringRest > 0
      ? [{ key: "other", label: "Other", value: ringRest, color: rankColor(colors, 5) }]
      : []),
  ];
  const incomeMinor = presentation?.currentMonth.incomeMinorUnits ?? 0;
  const netMinor = presentation?.currentMonth.netMinorUnits ?? 0;

  const recent = screen.transactions.slice(0, RECENT_LIMIT);

  // Highlights: the month's standout facts as KPIs — shares as rings, the
  // biggest day as mini bars, changes as a pill, subscriptions as logos —
  // each only when its data exists.
  const highlights: Highlight[] = [];
  const shortDay = (ms: number) =>
    new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const share = (part: number, whole: number) => (whole > 0 ? part / whole : 0);
  const pct = (part: number, whole: number) => Math.round(share(part, whole) * 100);
  const dayValues = screen.dailySeries.map((point) => Math.max(0, point.value));
  const peakIndex = dayValues.reduce(
    (best, value, index) => (value > (dayValues[best] ?? 0) ? index : best),
    0,
  );
  const peak = screen.dailySeries[peakIndex];

  if (tab === "income" && presentation) {
    const topSource = presentation.topIncomeSources[0];
    if (topSource) {
      highlights.push({
        key: "top-source",
        label: "Top source",
        value: topSource.source,
        ring: {
          fraction: share(topSource.currentMinorUnits, incomeMinor),
          color: rankColor(colors, 0),
        },
        detail: money(topSource.currentMinorUnits),
      });
    }
    if (incomeMinor > 0) {
      highlights.push({
        key: "saved",
        label: netMinor >= 0 ? "Kept this month" : "Spent beyond income",
        value: money(Math.abs(netMinor)),
        // The share of income still in hand after spending.
        ring: {
          fraction: netMinor > 0 ? share(netMinor, incomeMinor) : 0,
          color: netMinor >= 0 ? colors.positive : colors.negative,
        },
        detail: netMinor >= 0 ? "of income kept" : "more out than in",
      });
    }
    const credit = presentation.largestCredit;
    if (credit) {
      const creditDay = new Date(credit.date).getDate();
      highlights.push({
        key: "largest-credit",
        label: "Largest credit",
        value: money(credit.amountMinorUnits),
        visual:
          dayValues.length > 1 ? (
            <MiniBars
              values={dayValues}
              litIndex={screen.dailySeries.findIndex(
                (point) => new Date(point.day).getDate() === creditDay,
              )}
            />
          ) : undefined,
        detail: `${credit.source} · ${shortDay(credit.date)}`,
      });
    }
    const previousIncome = presentation.previousMonth.incomeMinorUnits;
    if (previousIncome > 0 || incomeMinor > 0) {
      highlights.push({
        key: "vs-last-month",
        label: "Vs last month",
        value: `${incomeMinor >= previousIncome ? "+" : "−"}${money(Math.abs(incomeMinor - previousIncome))}`,
        visual: (
          <DeltaPill percent={screen.comparison.percentChange} goodWhen="up" suffix="same days" />
        ),
        detail: `Then ${money(previousIncome)}`,
      });
    }
  }
  if (tab === "outcome" && presentation) {
    const topCategory = categories[0];
    if (topCategory) {
      highlights.push({
        key: "top-category",
        label: "Top category",
        value: topCategory.category,
        ring: {
          fraction: share(topCategory.currentMinorUnits, spentMinorUnits),
          color: rankColor(colors, 0),
        },
        detail: money(topCategory.currentMinorUnits),
        onPress: () => openSheet("categories"),
      });
    }
    const topVendor = presentation.topVendors[0];
    if (topVendor) {
      highlights.push({
        key: "top-vendor",
        label: "Top vendor",
        value: topVendor.vendor,
        ring: {
          fraction: share(topVendor.currentMinorUnits, spentMinorUnits),
          color: rankColor(colors, 1),
        },
        detail: `${topVendor.transactionCount} ${topVendor.transactionCount === 1 ? "payment" : "payments"} · ${money(topVendor.currentMinorUnits)}`,
        onPress: () => openSheet("vendors"),
      });
    }
    if (peak && peak.value > 0) {
      highlights.push({
        key: "biggest-day",
        label: "Biggest day",
        value: moneyLabel(peak.value, currency),
        visual:
          dayValues.length > 1 ? <MiniBars values={dayValues} litIndex={peakIndex} /> : undefined,
        detail: shortDay(peak.day),
      });
    }
    if (screen.comparison.currentTotal > 0) {
      highlights.push({
        key: "daily-average",
        label: "Daily average",
        value: moneyLabel(dailyAverage, currency),
        // Spending down is good news.
        visual: <DeltaPill percent={screen.comparison.percentChange} goodWhen="down" />,
        detail: `over ${elapsedDays} ${elapsedDays === 1 ? "day" : "days"}`,
      });
    }
    if (presentation.subscriptions.activeCount > 0) {
      const names = presentation.subscriptions.top.map((item) => item.merchant);
      highlights.push({
        key: "subscriptions",
        label: "Subscriptions",
        value: `${money(presentation.subscriptions.monthlyCommittedMinorUnits)}/mo`,
        visual: (
          <LogoStack
            names={names}
            more={Math.max(0, presentation.subscriptions.activeCount - Math.min(4, names.length))}
          />
        ),
        detail: `${presentation.subscriptions.activeCount} active`,
        onPress: () => openSheet("subscriptions"),
      });
    }
    if (presentation.currentMonth.transactionCount > 0) {
      const previousCount = presentation.previousMonth.transactionCount;
      highlights.push({
        key: "payments",
        label: "Payments",
        value: String(presentation.currentMonth.transactionCount),
        ...(previousCount > 0
          ? {
              ring: {
                fraction: Math.min(
                  1,
                  presentation.currentMonth.transactionCount / Math.max(previousCount, 1),
                ),
                color: rankColor(colors, 2),
              },
            }
          : {}),
        detail: previousCount > 0 ? `of ${previousCount} by now last month` : "this month",
        onPress: () => openSheet("transactions"),
      });
    }
  }

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
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: Math.max(12, insets.top) + 10,
          paddingBottom: tabBarClearance + 8,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text
              numberOfLines={1}
              className="text-screen font-semibold text-ink"
              style={{ fontFamily: headingFontFamily("semibold"), letterSpacing: -0.5 }}
            >
              Analytics
            </Text>
            <Text numberOfLines={1} className="text-caption text-muted">
              {formatMonthToDate(screen.atDate)}
            </Text>
          </View>
          {screen.currencies.length > 1 ? (
            <SelectPill
              value={currency}
              options={screen.currencies.map((code) => ({ value: code, label: code }))}
              onChange={screen.setSelectedCurrency}
              accessibilityLabel={`Currency ${currency}`}
            />
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh"
            onPress={screen.refresh}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full bg-card"
          >
            <AppIcon name="reload" size={17} color={colors.ink} />
          </Pressable>
        </View>

        <Segmented
          value={tab}
          options={tabOptions}
          onChange={(next) => {
            clearSelection();
            screen.setTabSelection(next);
          }}
          className="mt-4"
        />

        {/* The number and its chart. */}
        <View className="mt-4">
          {screen.overviewStatus === "error" && !presentation ? (
            <Card>
              <ErrorState body={screen.overviewError} onRetry={screen.reloadOverview} />
            </Card>
          ) : isFirstLoad ? (
            <SkeletonHero />
          ) : tab === "budget" ? (
            presentation?.budget ? (
              <AnalyticsBudgetCard budget={presentation.budget} currency={currency} />
            ) : (
              <Card>
                <EmptyState
                  icon="pie-chart"
                  title="No budget yet"
                  body="Set a monthly limit to see your pace here."
                />
              </Card>
            )
          ) : (
            <Card
              title={isIncome ? "Income" : "Spending"}
              subtitle={
                isMonth
                  ? `Each bar is a day this month. Tap one to see it.`
                  : `Each bar is a month. Tap one to see it.`
              }
            >
              <View className="flex-row items-start justify-between gap-3">
                <View className="min-w-0 flex-1">
                  <Text className="text-caption text-muted">{headlineLabel}</Text>
                  <HeroAmount
                    label={moneyLabel(headlineValue, currency)}
                    color={colors.ink}
                    mutedColor={colors.muted}
                    size={34}
                  />
                  {headlineNote ? (
                    <Text className="text-caption text-muted">{headlineNote}</Text>
                  ) : null}
                </View>
                {showDelta ? (
                  <View className="items-end pt-1">
                    <DeltaPill percent={percent} goodWhen={isIncome ? "up" : "down"} suffix="" />
                    {/* Like for like: the same days of last month. */}
                    <Text className="mt-1 text-meta text-muted">
                      vs {formatPreviousMonthToDate(screen.atDate)}
                    </Text>
                  </View>
                ) : null}
              </View>

              <Segmented
                value={screen.timeScope}
                options={[
                  { value: "month", label: "This month" },
                  { value: "sixMonths", label: "6 months" },
                ]}
                onChange={(next) => {
                  clearSelection();
                  screen.setTimeScope(next);
                }}
                size="sm"
                className="mt-4"
              />

              <View className="mt-6">
                {screen.chartError ? (
                  <ErrorState
                    compact
                    title="Chart unavailable"
                    body={screen.chartError}
                    onRetry={screen.retrySeries}
                  />
                ) : isMonth && dayBars.some((bar) => bar.value > 0) ? (
                  <SoftBarChart
                    dense
                    data={dayBars}
                    // Today is selected until a day is tapped; tap again to clear.
                    selectedKey={pickedDay?.key ?? dayBars[elapsedDays - 1]?.key ?? null}
                    onSelect={(key) => setSelectedDay(key === selectedDay ? null : key)}
                    selectedColor={isIncome ? colors.positive : colors.ink}
                    average={dailyAverage}
                    averageLabel={`avg ${moneyLabel(dailyAverage, currency)}/day`}
                  />
                ) : !isMonth && bars.some((bar) => bar.value > 0) ? (
                  <SoftBarChart
                    data={bars}
                    selectedKey={pickedBar?.key ?? null}
                    onSelect={(key) => setSelectedMonth(key === currentBar?.key ? null : key)}
                    selectedColor={isIncome ? colors.positive : colors.ink}
                  />
                ) : (
                  <View className="h-32 items-center justify-center rounded-tile bg-fill">
                    <Text className="text-caption text-muted">
                      {isIncome ? "No income recorded yet" : "No spending yet"}
                    </Text>
                  </View>
                )}
              </View>

              {tab === "outcome" ? (
                <View className="mt-3">
                  <SheetLinkCard
                    divider
                    icon={
                      <View className="h-10 w-10 items-center justify-center rounded-xl bg-fill">
                        <AppIcon name="pie-chart" size={18} color={colors.ink} />
                      </View>
                    }
                    title="View spending report"
                    detail="Every category this month"
                    onPress={() => openSheet("categories")}
                  />
                </View>
              ) : null}
            </Card>
          )}
        </View>

        {highlights.length > 0 ? (
          <Card title="Highlights" className="mt-4">
            <HighlightsGrid items={highlights} />
          </Card>
        ) : null}

        {/* Where it went: categories or merchants, each with its share ring
            and its change against the same days last month. */}
        {tab === "outcome" &&
        presentation &&
        (categories.length > 0 || presentation.topVendors.length > 0) ? (
          <Card
            title="Where it went"
            actionLabel="See all"
            onAction={() => openSheet(whereLens === "categories" ? "categories" : "vendors")}
            className="mt-4"
          >
            <Segmented
              value={whereLens}
              options={[
                { value: "categories", label: "Categories" },
                { value: "merchants", label: "Merchants" },
              ]}
              onChange={setWhereLens}
              size="sm"
            />
            <View className="mt-2">
              {whereLens === "categories" ? (
                <CategoryChangeList
                  categories={categories.slice(0, WHERE_LIMIT)}
                  totalMinorUnits={spentMinorUnits}
                  currency={currency}
                  onOpenCategory={(category) =>
                    openSheet("transactions", categoryTransactionFocus(category))
                  }
                />
              ) : (
                <VendorRankList
                  vendors={presentation.topVendors.slice(0, WHERE_LIMIT)}
                  totalMinorUnits={spentMinorUnits}
                  currency={currency}
                  onOpenVendor={(vendor) =>
                    openSheet("transactions", vendorTransactionFocus(vendor.vendor))
                  }
                />
              )}
            </View>
          </Card>
        ) : null}

        {tab === "income" && presentation && presentation.topIncomeSources.length > 0 ? (
          <Card title="Income sources" className="mt-4">
            <IncomeSourcesList
              sources={presentation.topIncomeSources}
              totalMinorUnits={incomeMinor}
              currency={currency}
            />
          </Card>
        ) : null}

        {/* The month's shape: the ring of categories, then in · out · net. */}
        {tab === "outcome" && spentMinorUnits > 0 ? (
          <Card title="Spending" className="mt-4">
            <View className="items-center">
              <SpendingRing segments={ringSegments}>
                <Text className="text-caption text-muted">Total spend</Text>
                <Text
                  className="text-ink"
                  style={{
                    fontFamily: headingFontFamily("semibold"),
                    fontSize: 24,
                    lineHeight: 30,
                    letterSpacing: -0.5,
                  }}
                >
                  {money(spentMinorUnits)}
                </Text>
              </SpendingRing>
            </View>
            <View className="mt-4 gap-2">
              {ringSegments.map((segment) => (
                <View key={segment.key} className="flex-row items-center gap-2">
                  <View
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: segment.color }}
                  />
                  <Text numberOfLines={1} className="min-w-0 flex-1 text-caption text-ink">
                    {segment.label}
                  </Text>
                  <Text className="w-10 text-right text-caption text-muted">
                    {pct(segment.value, spentMinorUnits)}%
                  </Text>
                  <Text className="w-24 text-right text-caption font-medium text-ink">
                    {money(segment.value)}
                  </Text>
                </View>
              ))}
            </View>
            <View
              className="mt-4 flex-row pt-4"
              style={{ borderTopWidth: 1, borderTopColor: colors.divider }}
            >
              {[
                { key: "in", label: "Income", value: money(incomeMinor) },
                { key: "out", label: "Spending", value: money(spentMinorUnits) },
                { key: "net", label: "Net", value: money(netMinor) },
              ].map((cell) => (
                <View key={cell.key} accessible className="flex-1">
                  <Text className="text-caption text-muted">{cell.label}</Text>
                  <Text numberOfLines={1} className="text-subtitle font-medium text-ink">
                    {cell.value}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {/* The newest payments. */}
        {tab !== "budget" ? (
          <Card
            title={isIncome ? "Latest income" : "Latest"}
            actionLabel={recent.length > 0 ? "See all" : undefined}
            onAction={recent.length > 0 ? () => openSheet("transactions") : undefined}
            className="mt-4"
          >
            {screen.transactionsStatus === "loading" && recent.length === 0 ? (
              <SkeletonRows count={3} />
            ) : screen.transactionsStatus === "error" && recent.length === 0 ? (
              <ErrorState
                compact
                body={screen.transactionsError}
                onRetry={screen.reloadTransactions}
              />
            ) : recent.length === 0 ? (
              <EmptyState compact icon="receipt" title="Nothing here yet" />
            ) : (
              recent.map((item) => (
                <LedgerRow
                  key={item.key}
                  leading={
                    <BrandLogo
                      letter={item.letter}
                      tile={item.tile}
                      ink={item.ink}
                      img={item.img ?? undefined}
                      size={40}
                      radius={12}
                      iconRatio={0.62}
                    />
                  }
                  title={item.name}
                  subtitle={item.sub}
                  amount={
                    item.amountValue != null
                      ? moneyLabel(Math.abs(item.amountValue), item.currency ?? currency)
                      : (item.amount ?? "")
                  }
                  direction={item.direction}
                  detail={item.category}
                  onPress={() => router.push(buildTransactionDetailRoute(item.key))}
                />
              ))
            )}
          </Card>
        ) : null}

        {tab === "outcome" ? (
          <View className="mt-4">
            <MessageInsightsSection
              insights={message.insights}
              status={message.status}
              onRetry={message.reload}
              currency={currency}
              onOpenOnlineMix={() => openSheet("online")}
              onOpenInvestments={() => openSheet("investments")}
              onOpenPlaces={() => openSheet("places")}
            />
          </View>
        ) : null}
      </ScrollView>

      <AnalyticsDetailSheets
        activeSheet={activeSheet}
        onActiveSheetChange={setActiveSheet}
        at={screen.atDate}
        tab={tab}
        presentation={presentation}
        categories={screen.categories}
        categoryTotal={screen.categoryTotal}
        isCategoryLoading={screen.isCategoryLoading}
        currency={currency}
        direction={screen.direction}
        transactions={screen.transactions}
        transactionsStatus={screen.transactionsStatus}
        transactionsError={screen.transactionsError}
        onReloadTransactions={screen.reloadTransactions}
        onOpenTransactions={(focus) => openSheet("transactions", focus)}
        transactionFocus={transactionFocus}
        transactionFocusKey={transactionFocusKey}
        currencies={screen.currencies}
        onCurrencyChange={screen.setSelectedCurrency}
        onSelectTransaction={(item) => router.push(buildTransactionDetailRoute(item.key))}
        messageInsights={message.insights}
      />
    </View>
  );
}
