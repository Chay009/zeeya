import { useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";
import { IconTile, ProgressBar } from "@/components/ui/controls";
import { NavBar } from "@/components/ui/header";
import { RowGroup, Row } from "@/components/ui/list";
import { Money, moneyLabel } from "@/components/ui/money";
import { Section } from "@/components/ui/section";
import { EmptyState, ErrorState, SkeletonHero, SkeletonRows } from "@/components/ui/states";
import { useThemeColors, withAlpha, type ThemeColors } from "@/components/ui/theme";
import { usePrimaryCurrency } from "@/features/insights/hooks/use-dashboard-currencies";
import { categoryIcon } from "@/features/insights/category-visual";
import { fromMinorUnits } from "@/lib/currency";

import type { BudgetPace, BudgetRowView, BudgetSummaryView } from "../budget-presentation";
import { useBudgets, useUnbudgetedCategories } from "../hooks/use-budgets";
import { budgetEditRoute } from "../routes";

const MONTH = new Intl.DateTimeFormat("en-IN", { month: "long" });

function paceColor(pace: BudgetPace, colors: ThemeColors): string {
  return pace === "over" ? colors.negative : pace === "watch" ? colors.warning : colors.chartLine;
}

function SummaryCard({
  summary,
  currency,
  monthStart,
}: {
  summary: BudgetSummaryView;
  currency: string;
  monthStart: number;
}) {
  const colors = useThemeColors();
  const pace: BudgetPace = summary.overCount > 0 ? "over" : summary.watchCount > 0 ? "watch" : "on-track";
  const status =
    summary.overCount > 0
      ? `${summary.overCount} over budget`
      : summary.watchCount > 0
        ? `${summary.watchCount} to watch`
        : "All on track";
  const left = summary.limitMinorUnits - summary.spentMinorUnits;
  return (
    <View className="mt-2 rounded-card bg-card p-5">
      <Text className="text-caption font-medium text-muted">
        {MONTH.format(monthStart)} · {summary.count} {summary.count === 1 ? "budget" : "budgets"}
      </Text>
      <View className="mt-1 flex-row items-baseline gap-1.5">
        <Money value={fromMinorUnits(summary.spentMinorUnits, currency)} currency={currency} size="hero" />
        <Text className="text-caption text-muted">
          of {moneyLabel(fromMinorUnits(summary.limitMinorUnits, currency), currency)}
        </Text>
      </View>
      <ProgressBar value={summary.used} color={paceColor(pace, colors)} height={8} className="mt-4" />
      <View className="mt-2 flex-row justify-between">
        <Text
          className={`text-meta font-medium ${pace === "over" ? "text-negative" : pace === "watch" ? "text-warning" : "text-ink-soft"}`}
        >
          {status}
        </Text>
        <Text className="text-meta text-muted">
          {left >= 0
            ? `${moneyLabel(fromMinorUnits(left, currency), currency)} left`
            : `${moneyLabel(fromMinorUnits(-left, currency), currency)} over`}
        </Text>
      </View>
    </View>
  );
}

function BudgetRow({ row, currency, onPress }: { row: BudgetRowView; currency: string; onPress: () => void }) {
  const colors = useThemeColors();
  const color = paceColor(row.pace, colors);
  const remaining = fromMinorUnits(Math.abs(row.remainingMinorUnits), currency);
  return (
    <Row
      onPress={onPress}
      accessibilityLabel={`${row.category} budget`}
      leading={<IconTile icon={categoryIcon(row.category)} color={color} background={withAlpha(color, 0.14)} />}
      title={row.category}
      subtitle={
        <View className="mt-1.5 gap-1.5">
          <ProgressBar value={row.used} color={color} height={5} />
          <Text numberOfLines={1} className="text-meta text-muted">
            {moneyLabel(fromMinorUnits(row.spentMinorUnits, currency), currency)} of{" "}
            {moneyLabel(fromMinorUnits(row.limitMinorUnits, currency), currency)}
          </Text>
        </View>
      }
      trailing={
        <Text
          numberOfLines={1}
          className={`text-caption font-semibold ${row.pace === "over" ? "text-negative" : "text-ink"}`}
        >
          {moneyLabel(remaining, currency)}
        </Text>
      }
      trailingSubtitle={row.remainingMinorUnits >= 0 ? "left" : "over"}
      chevron
    />
  );
}

export function BudgetsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const currency = usePrimaryCurrency();
  const { status, error, reload, overview, rows, summary } = useBudgets(currency);
  const candidates = useUnbudgetedCategories(overview);

  const openEditor = (category: string) => router.push(budgetEditRoute(category));

  return (
    <View className="flex-1 bg-background">
      <NavBar title="Budgets" onBack={() => router.back()} topInset={insets.top} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {status === "loading" ? (
          <View className="mt-2 gap-6">
            <SkeletonHero />
            <SkeletonRows count={4} />
          </View>
        ) : status === "error" || !overview ? (
          <View className="mt-2 rounded-card bg-card">
            <ErrorState compact title="Couldn't load budgets" body={error} onRetry={reload} />
          </View>
        ) : (
          <>
            {summary ? (
              <SummaryCard summary={summary} currency={currency} monthStart={overview.monthStart} />
            ) : (
              <View className="mt-2 rounded-card bg-card p-5">
                <View className="flex-row items-center gap-3">
                  <IconTile icon="pie-chart" color={colors.accentDeep} background={withAlpha(colors.accentDeep, 0.14)} />
                  <Text className="min-w-0 flex-1 text-body font-semibold text-ink">
                    Give your biggest categories a monthly limit
                  </Text>
                </View>
                <Text className="mt-3 text-caption text-muted">
                  Zeeya tracks each one as your bank messages arrive and tells you when you're
                  running ahead of the month.
                </Text>
              </View>
            )}

            {rows.length > 0 ? (
              <Section title="This month">
                <RowGroup>
                  {rows.map((row) => (
                    <BudgetRow
                      key={row.category}
                      row={row}
                      currency={currency}
                      onPress={() => openEditor(row.category)}
                    />
                  ))}
                </RowGroup>
              </Section>
            ) : null}

            {candidates.length > 0 ? (
              <Section title={rows.length > 0 ? "Add a budget" : "Your categories"}>
                <RowGroup>
                  {candidates.map((candidate) => (
                    <Row
                      key={candidate.category}
                      onPress={() => openEditor(candidate.category)}
                      accessibilityLabel={`Set a budget for ${candidate.category}`}
                      leading={
                        <IconTile
                          icon={categoryIcon(candidate.category)}
                          color={colors.muted}
                          background={colors.fill}
                        />
                      }
                      title={candidate.category}
                      subtitle={
                        candidate.averageMonthlyMinorUnits > 0
                          ? `About ${moneyLabel(fromMinorUnits(candidate.averageMonthlyMinorUnits, currency), currency)} a month`
                          : `${moneyLabel(fromMinorUnits(candidate.thisMonthMinorUnits, currency), currency)} so far this month`
                      }
                      trailing={<AppIcon name="chevron-right" size={16} color={colors.faint} />}
                    />
                  ))}
                </RowGroup>
              </Section>
            ) : rows.length === 0 ? (
              <View className="mt-6 rounded-card bg-card">
                <EmptyState
                  icon="pie-chart"
                  title="No spending to budget yet"
                  body="Categories appear here once your bank messages show where money goes."
                />
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}
