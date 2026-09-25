import type {
  BudgetPerformance,
  FinancialPeriodSummary,
  InsightsOverview,
  RankedSpendingComparison,
  SubscriptionSummary,
  VendorSpendingComparison,
} from "@/lib/dashboard-data";
import { fromMinorUnits } from "@/lib/currency";

const CATEGORY_COLORS = ["#8b6dff", "#12a150", "#f5a524", "#f76808", "#0090ff", "#12a594"];

export interface InsightsCategorySlice {
  [key: string]: string | number;
  label: string;
  value: number;
  color: string;
}

export interface InsightsPresentation {
  currency: string;
  currentMonth: FinancialPeriodSummary;
  previousMonth: FinancialPeriodSummary;
  spendingChangePercent: number | null;
  topCategories: RankedSpendingComparison[];
  topVendors: VendorSpendingComparison[];
  subscriptions: {
    activeCount: number;
    likelyCount: number;
    monthlyCommittedMinorUnits: number;
    top: SubscriptionSummary[];
  };
  budget: BudgetPerformance | null;
}

/**
 * Keeps the SQL overview as the only owner of ranking and aggregate values.
 * Presentation code receives the already-bounded rows and only chooses which
 * sections are eligible to render.
 */
export function mapInsightsOverview(overview: InsightsOverview): InsightsPresentation {
  const budget =
    overview.budget !== null && overview.budget.dailyBudgetMinorUnits > 0 ? overview.budget : null;

  return {
    currency: overview.currency,
    currentMonth: overview.currentMonth,
    previousMonth: overview.previousMonth,
    spendingChangePercent: overview.spendingChangePercent,
    topCategories: overview.topCategories,
    topVendors: overview.topVendors,
    subscriptions: overview.subscriptions,
    budget,
  };
}

export function hasInsightsActivity(presentation: InsightsPresentation): boolean {
  return (
    presentation.currentMonth.transactionCount > 0 ||
    presentation.previousMonth.transactionCount > 0 ||
    presentation.topCategories.length > 0 ||
    presentation.topVendors.length > 0 ||
    presentation.subscriptions.activeCount > 0
  );
}

/** Adapts SQL-ranked minor-unit rows for the category breakdown panel. */
export function mapTopCategoriesToSlices(
  presentation: InsightsPresentation,
): InsightsCategorySlice[] {
  return presentation.topCategories.map((category, index) => ({
    label: category.category,
    value: fromMinorUnits(category.currentMinorUnits, presentation.currency),
    color: CATEGORY_COLORS[index % CATEGORY_COLORS.length]!,
  }));
}
