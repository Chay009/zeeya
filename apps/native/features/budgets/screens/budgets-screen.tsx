import { useRouter } from "expo-router";
import { ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "@/components/app-text";
import { Art, hasArt } from "@/components/art/art";
import { CategoryTile } from "@/components/finance/category-tile";
import { AppIcon } from "@/components/icon";
import { IconTile } from "@/components/ui/controls";
import { NavBar } from "@/components/ui/header";
import { SCREEN_PADDING_X } from "@/components/ui/screen";
import { headingFontFamily } from "@/lib/fonts";
import { HeroAmount } from "@/components/ui/hero-amount";
import { RowGroup, Row } from "@/components/ui/list";
import { moneyLabel } from "@/components/ui/money";
import { StripedProgress } from "@/components/ui/striped-progress";
import { Section } from "@/components/ui/section";
import { EmptyState, ErrorState, SkeletonHero, SkeletonRows } from "@/components/ui/states";
import { useThemeColors, withAlpha, type ThemeColors } from "@/components/ui/theme";
import { usePrimaryCurrency } from "@/features/insights/hooks/use-dashboard-currencies";
import { fromMinorUnits } from "@/lib/currency";

import type { BudgetPace, BudgetRowView, BudgetSummaryView } from "../budget-presentation";
import { useBudgets, useUnbudgetedCategories } from "../hooks/use-budgets";
import { budgetEditRoute } from "../routes";

const MONTH = new Intl.DateTimeFormat("en-IN", { month: "long" });

// The summary's jar rises out of the card's top-right corner. The art is
// square with the jar centred in it (taller than wide: 71.5% of the square's
// width), so the room the numbers leave it is derived from its size, which
// scales with the screen.
const JAR_WIDTH = 0.715;
const JAR_RISE = 48;
const JAR_INSET = 4;
const CARD_PADDING = 20;
// The month's title sits in the band the jar rises into, so that band holds
// content instead of being empty beside the jar.
const TITLE_BAND = 60;
// Budget rows: the art tile, and where the row dividers start (16pt row
// padding + tile + 12pt gap) so they line up with the text, not the art.
const ROW_TILE = 52;
const ROW_INSET = 16 + ROW_TILE + 12;

function jarLayout(windowWidth: number) {
  const size = Math.round(Math.min(150, Math.max(120, windowWidth * 0.38)));
  const sidePad = (size * (1 - JAR_WIDTH)) / 2;
  return {
    size,
    // From the text column's right edge to the jar's left edge, plus a gap.
    clearance: Math.round(JAR_INSET + size - sidePad - CARD_PADDING + 8),
  };
}

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
  const pace: BudgetPace =
    summary.overCount > 0 ? "over" : summary.watchCount > 0 ? "watch" : "on-track";
  const status =
    summary.overCount > 0
      ? `${summary.overCount} over budget`
      : summary.watchCount > 0
        ? `${summary.watchCount} to watch`
        : "All on track";
  const left = summary.limitMinorUnits - summary.spentMinorUnits;
  const limit = moneyLabel(fromMinorUnits(summary.limitMinorUnits, currency), currency);
  const { width: windowWidth } = useWindowDimensions();
  const jar = hasArt("hero-jar") ? jarLayout(windowWidth) : null;
  // The month's title, then its summary on a lime field with the jar rising
  // out of the field's top edge beside the title — the screen's one big
  // moment. It leads with what's left, the number a budget is for.
  return (
    <View className="mt-1">
      <View
        className="justify-end px-1"
        style={{ height: TITLE_BAND, paddingBottom: 10, marginRight: jar?.clearance ?? 0 }}
      >
        <Text
          numberOfLines={1}
          className="font-bold text-ink"
          style={{
            fontFamily: headingFontFamily("bold"),
            fontSize: 22,
            lineHeight: 28,
            letterSpacing: -0.5,
          }}
        >
          {MONTH.format(monthStart)}
        </Text>
        <Text className="text-caption text-muted">
          {summary.count} {summary.count === 1 ? "budget" : "budgets"}
        </Text>
      </View>
      <View
        className="rounded-card"
        style={{
          padding: CARD_PADDING,
          borderCurve: "continuous",
          backgroundColor: withAlpha(colors.accent, colors.isDark ? 0.12 : 0.2),
        }}
      >
        <View className="min-w-0" style={{ marginRight: jar?.clearance ?? 0 }}>
          <View>
            <HeroAmount
              label={moneyLabel(fromMinorUnits(Math.abs(left), currency), currency)}
              color={left >= 0 ? colors.ink : colors.negative}
              mutedColor={colors.muted}
              size={36}
            />
          </View>
          <Text className="mt-0.5 text-caption text-muted">
            {left >= 0 ? `left of ${limit} this month` : `over ${limit} this month`}
          </Text>
        </View>
        <StripedProgress
          value={summary.used}
          color={paceColor(pace, colors)}
          label={`${Math.round(summary.used * 100)}% USED`}
          className="mt-4"
        />
        <View className="mt-2.5 flex-row justify-between">
          <Text
            className={`text-meta font-medium ${pace === "over" ? "text-negative" : pace === "watch" ? "text-warning" : "text-ink-soft"}`}
          >
            {status}
          </Text>
          <Text className="text-meta text-muted">
            {moneyLabel(fromMinorUnits(summary.spentMinorUnits, currency), currency)} spent
          </Text>
        </View>
      </View>
      {jar ? (
        <View
          pointerEvents="none"
          style={{ position: "absolute", top: TITLE_BAND - JAR_RISE, right: JAR_INSET }}
        >
          <Art name="hero-jar" size={jar.size} />
        </View>
      ) : null}
    </View>
  );
}

function BudgetRow({
  row,
  currency,
  onPress,
}: {
  row: BudgetRowView;
  currency: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const color = paceColor(row.pace, colors);
  const remaining = fromMinorUnits(Math.abs(row.remainingMinorUnits), currency);
  return (
    <Row
      onPress={onPress}
      accessibilityLabel={`${row.category} budget`}
      leading={<CategoryTile label={row.category} color={color} size={ROW_TILE} />}
      title={row.category}
      subtitle={
        <View className="mt-1.5 gap-1.5">
          <StripedProgress value={row.used} color={color} height={8} />
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
        contentContainerStyle={{
          paddingHorizontal: SCREEN_PADDING_X,
          paddingBottom: insets.bottom + 32,
        }}
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
                  <Art
                    name="hero-target"
                    size={72}
                    fallback={
                      <IconTile
                        icon="pie-chart"
                        color={colors.accentDeep}
                        background={withAlpha(colors.accentDeep, 0.14)}
                      />
                    }
                  />
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
                <RowGroup inset={ROW_INSET}>
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
                <RowGroup inset={ROW_INSET}>
                  {candidates.map((candidate) => (
                    <Row
                      key={candidate.category}
                      onPress={() => openEditor(candidate.category)}
                      accessibilityLabel={`Set a budget for ${candidate.category}`}
                      leading={
                        <CategoryTile
                          label={candidate.category}
                          color={colors.muted}
                          size={ROW_TILE}
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
                  art="hero-target"
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
