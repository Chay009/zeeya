import type { ThemeColors } from "@/components/ui/theme";

import type { AnalyticsTab } from "./analytics-scope";

export interface AnalyticsTabTheme {
  lineColor: string;
  areaStartColor: string;
  areaEndColor: string;
  /** @deprecated */
  areaColor: string;
  deltaTextClass: (percentChange: number | null) => string;
  showOutcomeSubCards: boolean;
}

export function analyticsTabTheme(tab: AnalyticsTab, colors: ThemeColors): AnalyticsTabTheme {
  if (tab === "income") {
    return {
      lineColor: colors.positive,
      areaStartColor: "rgba(18,161,80,0.26)",
      areaEndColor: "rgba(18,161,80,0.0)",
      areaColor: "rgba(18,161,80,0.14)",
      deltaTextClass: (percentChange) => {
        if (percentChange === null || percentChange === 0) return "text-muted";
        return percentChange > 0 ? "text-positive" : "text-negative";
      },
      showOutcomeSubCards: false,
    };
  }

  return {
    lineColor: colors.negative,
    areaStartColor: "rgba(208,91,81,0.24)",
    areaEndColor: "rgba(208,91,81,0.0)",
    areaColor: "rgba(208,91,81,0.12)",
    // Spending going DOWN is the good outcome.
    deltaTextClass: (percentChange) => {
      if (percentChange === null || percentChange === 0) return "text-muted";
      return percentChange > 0 ? "text-negative" : "text-positive";
    },
    showOutcomeSubCards: tab === "outcome",
  };
}

export function formatComparisonDelta(percentChange: number | null): string | null {
  if (percentChange === null) return null;
  const arrow = percentChange > 0 ? "↑" : percentChange < 0 ? "↓" : "→";
  return `${arrow} ${Math.abs(percentChange).toFixed(1)}% vs this time last month`;
}
