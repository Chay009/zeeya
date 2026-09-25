import type { HomeHighlights } from "@/lib/dashboard-data";

export function hasHomeHighlightsData(highlights: HomeHighlights): boolean {
  return (
    highlights.today.transactionCount > 0 ||
    highlights.today.recent.length > 0 ||
    highlights.today.largestTransaction !== null ||
    highlights.subscriptions.activeCount > 0 ||
    highlights.subscriptions.spentThisMonthMinorUnits > 0 ||
    highlights.upcomingPayments.length > 0
  );
}
