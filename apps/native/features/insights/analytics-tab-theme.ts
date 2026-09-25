import { hp } from "@/features/home-preview/theme";

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

export function analyticsTabTheme(tab: AnalyticsTab): AnalyticsTabTheme {
  if (tab === "income") {
    return {
      lineColor: hp.positive,
      areaStartColor: "rgba(18,161,80,0.26)",
      areaEndColor: "rgba(18,161,80,0.0)",
      areaColor: "rgba(18,161,80,0.14)",
      deltaTextClass: (percentChange) => {
        if (percentChange === null || percentChange === 0) return "text-muted";
        return percentChange > 0 ? "text-positive" : "text-coral";
      },
      showOutcomeSubCards: false,
    };
  }

  return {
    lineColor: hp.coralBar,
    areaStartColor: "rgba(208,91,81,0.24)",
    areaEndColor: "rgba(208,91,81,0.0)",
    areaColor: "rgba(208,91,81,0.12)",
    deltaTextClass: () => "text-coral",
    showOutcomeSubCards: tab === "outcome",
  };
}

export function formatComparisonDelta(percentChange: number | null): string | null {
  if (percentChange === null) return null;
  const arrow = percentChange > 0 ? "↑" : percentChange < 0 ? "↓" : "→";
  return `${arrow} ${Math.abs(percentChange).toFixed(1)}% vs last month`;
}
