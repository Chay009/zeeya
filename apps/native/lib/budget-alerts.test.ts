import { describe, expect, it } from "vitest";

import { budgetAlertLevel, budgetAlertMessage, newBudgetAlerts } from "./budget-alerts";

describe("budgetAlertLevel", () => {
  it("is 85 from 85% of the limit and 100 only once over it", () => {
    expect(budgetAlertLevel(8_499, 10_000)).toBe(0);
    expect(budgetAlertLevel(8_500, 10_000)).toBe(85);
    expect(budgetAlertLevel(10_000, 10_000)).toBe(85);
    expect(budgetAlertLevel(10_001, 10_000)).toBe(100);
  });
});

describe("newBudgetAlerts", () => {
  it("returns only budgets above the level already alerted", () => {
    const base = { currency: "INR", limitMinorUnits: 10_000 };
    expect(
      newBudgetAlerts([
        { ...base, category: "Food", spentMinorUnits: 9_000, alertedLevel: 0 },
        { ...base, category: "Fuel", spentMinorUnits: 9_000, alertedLevel: 85 },
        { ...base, category: "Rent", spentMinorUnits: 12_000, alertedLevel: 85 },
        { ...base, category: "Gym", spentMinorUnits: 12_000, alertedLevel: 100 },
      ]),
    ).toEqual([
      { category: "Food", currency: "INR", level: 85 },
      { category: "Rent", currency: "INR", level: 100 },
    ]);
  });
});

describe("budgetAlertMessage", () => {
  it("names one budget and its level, never an amount", () => {
    expect(budgetAlertMessage([{ category: "Food", currency: "INR", level: 85 }])).toEqual({
      title: "Budget alert",
      body: "Food is at 85% of its monthly budget.",
    });
    expect(budgetAlertMessage([{ category: "Food", currency: "INR", level: 100 }])).toEqual({
      title: "Over budget",
      body: "Food is over its monthly budget.",
    });
  });

  it("groups several into one notification", () => {
    expect(
      budgetAlertMessage([
        { category: "Food", currency: "INR", level: 100 },
        { category: "Fuel", currency: "INR", level: 85 },
        { category: "Travel", currency: "INR", level: 85 },
        { category: "Gym", currency: "INR", level: 85 },
      ]),
    ).toEqual({
      title: "4 budgets need attention",
      body: "Over budget: Food. Nearing the limit: Fuel, Travel and Gym.",
    });
    expect(budgetAlertMessage([])).toBeNull();
  });
});
