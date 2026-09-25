import { Pressable, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { hp } from "@/features/home-preview/theme";
import { moneyFontFamily } from "@/lib/fonts";

import { analyticsTabChartTitle } from "../analytics-format";
import { analyticsTabTheme } from "../analytics-tab-theme";
import {
  type AnalyticsDirection,
  type AnalyticsTab,
  type InsightsTimeScope,
} from "../analytics-scope";
import type { MonthlyValue, SpendingPoint } from "../insights-data";
import { AnalyticsCard } from "./analytics-card";
import { ZeeyaAreaChart } from "./zeeya-area-chart";
import { ZeeyaMonthlyBarChart } from "./zeeya-monthly-bar-chart";

function ChartFallback({
  title,
  body,
  onRetry,
}: {
  title: string;
  body: string;
  onRetry?: () => void;
}) {
  return (
    <View style={{ minHeight: 190, justifyContent: "center", paddingVertical: 12 }}>
      <Text className="text-body font-bold text-ink">{title}</Text>
      <Text className="mt-1 text-[13px] leading-[18px] text-muted">{body}</Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry loading analytics chart"
          onPress={onRetry}
          style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}
        >
          <Text className="text-[13px] font-bold text-accent">Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function AnalyticsHero({
  tab,
  direction,
  scope,
  currency,
  dailySeries,
  monthlySeries,
  error,
  onRetry,
  at,
}: {
  tab: AnalyticsTab;
  direction: AnalyticsDirection;
  scope: InsightsTimeScope;
  currency: string;
  dailySeries: SpendingPoint[];
  monthlySeries: MonthlyValue[];
  error: string | null;
  onRetry: () => void;
  at: Date;
}) {
  const theme = analyticsTabTheme(tab);
  const hasDaily = dailySeries.some((point) => point.value > 0);
  const hasMonthly = monthlySeries.some((point) => point.value > 0);
  const activeBarColor = direction === "income" ? hp.positive : hp.coralBar;
  return (
    <AnalyticsCard>
      <Text
        className="text-[17px] font-extrabold text-ink"
        style={{ fontFamily: moneyFontFamily("bold") }}
      >
        {analyticsTabChartTitle(tab)}
      </Text>

      <View style={{ marginTop: 12 }}>
        {error ? (
          <ChartFallback title="Chart unavailable" body={error} onRetry={onRetry} />
        ) : scope === "month" && hasDaily ? (
          <ZeeyaAreaChart
            data={dailySeries}
            height={190}
            lineColor={theme.lineColor}
            areaStartColor={theme.areaStartColor}
            areaEndColor={theme.areaEndColor}
            showAxes
            currency={currency}
            at={at}
          />
        ) : scope !== "month" && hasMonthly ? (
          <ZeeyaMonthlyBarChart
            data={monthlySeries}
            currency={currency}
            activeBarColor={activeBarColor}
          />
        ) : null}
      </View>
    </AnalyticsCard>
  );
}
