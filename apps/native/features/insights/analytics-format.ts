import type { AnalyticsTab } from "./analytics-scope";

export function formatAnalyticsPeriod(at: Date): string {
  return at.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export function formatAnalyticsHeaderSubtitle(at: Date, currency: string): string {
  return `${formatAnalyticsPeriod(at)} · ${currency}`;
}

export function formatAnalyticsSheetSubtitle(
  at: Date,
  tab: AnalyticsTab,
  currency: string,
): string {
  const tabLabel = tab === "income" ? "Income" : tab === "budget" ? "Budget" : "Outcome";
  return `${formatAnalyticsPeriod(at)} · ${tabLabel} · ${currency}`;
}

export function analyticsTabChartTitle(tab: AnalyticsTab): string {
  if (tab === "income") return "Income";
  if (tab === "budget") return "Spending";
  return "Outcome";
}

export function analyticsOverviewHeadline(tab: AnalyticsTab): string {
  if (tab === "income") return "earned this month";
  return "spent this month";
}
