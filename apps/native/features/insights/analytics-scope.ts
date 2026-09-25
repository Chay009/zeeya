export type InsightsTimeScope = "month" | "sixMonths";
export type AnalyticsTab = "income" | "outcome" | "budget";
export type AnalyticsDirection = "income" | "expense";

export const INSIGHTS_TIME_SCOPES = [
  { value: "month", label: "This month", detail: "Daily view" },
  { value: "sixMonths", label: "6 months", detail: "Monthly trend" },
] as const satisfies ReadonlyArray<{
  value: InsightsTimeScope;
  label: string;
  detail: string;
}>;

/**
 * The daily query is inclusive of `at` and should begin on the first day of
 * the selected calendar month. The existing data-source contract expresses
 * that bounded window as a number of days, so the elapsed day-of-month is the
 * smallest honest window for the This month view.
 */
export function elapsedDaysInCurrentMonth(at: Date): number {
  return Math.max(1, at.getDate());
}

export function usesDailySeries(scope: InsightsTimeScope): boolean {
  return scope === "month";
}

export function scopeLabel(scope: InsightsTimeScope): string {
  return scope === "month" ? "This month" : "6 months";
}
