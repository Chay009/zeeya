import { describe, expect, it } from "vitest";

import type { InsightsOverview } from "@/lib/dashboard-data";

import { hasInsightsActivity, mapInsightsOverview } from "./insights-presentation";

function overview(budget: InsightsOverview["budget"]): InsightsOverview {
  return {
    currency: "INR",
    currentMonth: {
      incomeMinorUnits: 20_000,
      spendingMinorUnits: 8_000,
      netMinorUnits: 12_000,
      transactionCount: 4,
    },
    previousMonth: {
      incomeMinorUnits: 15_000,
      spendingMinorUnits: 6_000,
      netMinorUnits: 9_000,
      transactionCount: 3,
    },
    spendingChangePercent: 33,
    topCategories: [
      {
        category: "Travel",
        currentMinorUnits: 5_000,
        previousMinorUnits: 2_000,
        deltaMinorUnits: 3_000,
        changePercent: 150,
      },
    ],
    topVendors: [
      {
        vendor: "Rail",
        currentMinorUnits: 5_000,
        previousMinorUnits: 2_000,
        deltaMinorUnits: 3_000,
        changePercent: 150,
        transactionCount: 2,
      },
    ],
    subscriptions: {
      activeCount: 2,
      likelyCount: 1,
      monthlyCommittedMinorUnits: 1_000,
      top: [],
    },
    budget,
  };
}

describe("mapInsightsOverview", () => {
  it("preserves SQL totals, comparisons, and rankings without recomputing them", () => {
    const source = overview(null);
    const result = mapInsightsOverview(source);
    expect(result.currentMonth).toBe(source.currentMonth);
    expect(result.previousMonth).toBe(source.previousMonth);
    expect(result.topCategories).toBe(source.topCategories);
    expect(result.topVendors).toBe(source.topVendors);
    expect(result.subscriptions).toBe(source.subscriptions);
    expect(result.spendingChangePercent).toBe(33);
    expect(hasInsightsActivity(result)).toBe(true);
  });

  it("only exposes budget performance when a positive daily budget exists", () => {
    const budget = {
      dailyBudgetMinorUnits: 1_000,
      currentMonthBudgetMinorUnits: 30_000,
      currentMonthSpentMinorUnits: 8_000,
      elapsedDays: 8,
      daysWithinBudget: 7,
      daysOverBudget: 1,
      adherenceScore: 88,
      averageDailySpendMinorUnits: 1_000,
      projectedMonthSpendMinorUnits: 30_000,
      remainingMinorUnits: 22_000,
      usedPercent: 27,
      months: [],
    };
    expect(mapInsightsOverview(overview(budget)).budget).toBe(budget);
    expect(
      mapInsightsOverview(overview({ ...budget, dailyBudgetMinorUnits: 0 })).budget,
    ).toBeNull();
  });
});
