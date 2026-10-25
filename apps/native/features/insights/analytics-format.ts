import { addCalendarMonths } from "@/lib/calendar";
import { dateFormat } from "@/lib/intl-format";

import type { AnalyticsTab } from "./analytics-scope";

export function formatAnalyticsPeriod(at: Date): string {
  return dateFormat("en-IN", { month: "long", year: "numeric" }).format(at);
}

function shortMonth(at: Date): string {
  return dateFormat("en-IN", { month: "short" }).format(at);
}

/**
 * The month so far, as the totals really cover it: "1–3 Oct 2026" (or
 * "1 Oct 2026" on the 1st) — so a month-to-date total never reads as the
 * whole month's.
 */
export function formatMonthToDate(at: Date, withYear = true): string {
  const day = at.getDate();
  const range = day === 1 ? "1" : `1–${day}`;
  return `${range} ${shortMonth(at)}${withYear ? ` ${at.getFullYear()}` : ""}`;
}

/** The like-for-like window last month: "1–3 Sep" (clamped to its length). */
export function formatPreviousMonthToDate(at: Date): string {
  return formatMonthToDate(new Date(addCalendarMonths(at, -1)), false);
}

export function formatAnalyticsHeaderSubtitle(at: Date, currency: string): string {
  return `${formatAnalyticsPeriod(at)} · ${currency}`;
}

export function formatAnalyticsSheetSubtitle(
  at: Date,
  tab: AnalyticsTab,
  currency: string,
): string {
  const tabLabel = tab === "income" ? "Income" : tab === "budget" ? "Budget" : "Spending";
  return `${formatMonthToDate(at)} · ${tabLabel} · ${currency}`;
}

export function analyticsTabChartTitle(tab: AnalyticsTab): string {
  if (tab === "income") return "Income";
  if (tab === "budget") return "Spending";
  return "Spending";
}

export function analyticsOverviewHeadline(tab: AnalyticsTab): string {
  if (tab === "income") return "earned this month";
  return "spent this month";
}
