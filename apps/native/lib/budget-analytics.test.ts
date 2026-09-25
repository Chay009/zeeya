import { describe, expect, it } from "vitest";

import { computeBudgetPerformance } from "./budget-analytics";

describe("computeBudgetPerformance", () => {
  it("scores elapsed calendar days transparently and projects the current month", () => {
    const at = new Date(2026, 8, 10, 12).getTime();
    const september = new Date(2026, 8, 1).getTime();
    const august = new Date(2026, 7, 1).getTime();

    const result = computeBudgetPerformance({
      at,
      dailyBudgetMinorUnits: 1_000,
      months: [
        {
          monthStart: august,
          dailySpend: [
            { dayStart: new Date(2026, 7, 1).getTime(), spentMinorUnits: 900 },
            { dayStart: new Date(2026, 7, 2).getTime(), spentMinorUnits: 1_100 },
          ],
        },
        {
          monthStart: september,
          dailySpend: [
            { dayStart: new Date(2026, 8, 1).getTime(), spentMinorUnits: 500 },
            { dayStart: new Date(2026, 8, 2).getTime(), spentMinorUnits: 1_500 },
            { dayStart: new Date(2026, 8, 10).getTime(), spentMinorUnits: 1_000 },
          ],
        },
      ],
    });

    expect(result).not.toBeNull();
    if (!result) throw new Error("Expected configured budget performance.");
    expect(result).toMatchObject({
      dailyBudgetMinorUnits: 1_000,
      currentMonthBudgetMinorUnits: 30_000,
      currentMonthSpentMinorUnits: 3_000,
      elapsedDays: 10,
      daysWithinBudget: 9,
      daysOverBudget: 1,
      adherenceScore: 90,
      averageDailySpendMinorUnits: 300,
      projectedMonthSpendMinorUnits: 9_000,
      remainingMinorUnits: 27_000,
    });
    expect(result.overBudgetDayStarts).toEqual([new Date(2026, 8, 2).getTime()]);
    expect(result.months).toEqual([
      {
        monthStart: august,
        budgetMinorUnits: 31_000,
        spentMinorUnits: 2_000,
        daysWithinBudget: 30,
        daysOverBudget: 1,
        adherenceScore: 97,
      },
      {
        monthStart: september,
        budgetMinorUnits: 30_000,
        spentMinorUnits: 3_000,
        daysWithinBudget: 9,
        daysOverBudget: 1,
        adherenceScore: 90,
      },
    ]);
  });

  it("returns null when no daily budget is configured", () => {
    expect(
      computeBudgetPerformance({
        at: new Date(2026, 8, 10).getTime(),
        dailyBudgetMinorUnits: undefined,
        months: [],
      }),
    ).toBeNull();
  });

  it("rejects non-positive or non-integer budget values", () => {
    expect(() => computeBudgetPerformance({ at: 0, dailyBudgetMinorUnits: 0, months: [] })).toThrow(
      "dailyBudgetMinorUnits",
    );
    expect(() =>
      computeBudgetPerformance({ at: 0, dailyBudgetMinorUnits: 1.5, months: [] }),
    ).toThrow("dailyBudgetMinorUnits");
  });
});
