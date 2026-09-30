import { describe, expect, it } from "vitest";

import type { BudgetOverview } from "@/lib/dashboard-data";

import {
  budgetPace,
  budgetRows,
  budgetSummary,
  parseLimitInput,
  suggestedLimitMinorUnits,
  unbudgetedCategories,
} from "./budget-presentation";

const monthStart = new Date(2026, 8, 1).getTime();
const monthEnd = new Date(2026, 9, 1).getTime();
const midMonth = new Date(2026, 8, 16).getTime(); // exactly half of September

function overview(budgets: BudgetOverview["budgets"], categories: BudgetOverview["categories"] = []) {
  return { currency: "INR", monthStart, monthEnd, budgets, categories } satisfies BudgetOverview;
}

describe("budgetPace", () => {
  it("is over once spend passes the limit", () => {
    expect(budgetPace(101, 100, 0.5)).toBe("over");
  });

  it("watches at 85% used, whatever the date", () => {
    expect(budgetPace(85, 100, 0.95)).toBe("watch");
  });

  it("watches when clearly ahead of an even pace", () => {
    // Half the month gone; 60% spent is > 50% × 1.15.
    expect(budgetPace(60, 100, 0.5)).toBe("watch");
    expect(budgetPace(55, 100, 0.5)).toBe("on-track");
  });

  it("does not judge pace in the first days of the month", () => {
    expect(budgetPace(40, 100, 0.05)).toBe("on-track");
  });
});

describe("budgetRows and budgetSummary", () => {
  const data = overview([
    { category: "Food", limitMinorUnits: 10_000, spentMinorUnits: 3_000 },
    { category: "Travel", limitMinorUnits: 5_000, spentMinorUnits: 6_000 },
    { category: "Fuel", limitMinorUnits: 4_000, spentMinorUnits: 3_600 },
  ]);

  it("orders the most urgent first and reports what's left", () => {
    const rows = budgetRows(data, midMonth);
    expect(rows.map((row) => [row.category, row.pace])).toEqual([
      ["Travel", "over"],
      ["Fuel", "watch"],
      ["Food", "on-track"],
    ]);
    expect(rows[0]!.remainingMinorUnits).toBe(-1_000);
  });

  it("totals only the budgeted categories", () => {
    expect(budgetSummary(budgetRows(data, midMonth))).toEqual({
      count: 3,
      limitMinorUnits: 19_000,
      spentMinorUnits: 12_600,
      used: 12_600 / 19_000,
      overCount: 1,
      watchCount: 1,
    });
    expect(budgetSummary([])).toBeNull();
  });
});

describe("unbudgetedCategories", () => {
  it("lists spending categories without a budget", () => {
    const data = overview(
      [{ category: "Food", limitMinorUnits: 10_000, spentMinorUnits: 0 }],
      [
        { category: "Food", thisMonthMinorUnits: 0, averageMonthlyMinorUnits: 9_000 },
        { category: "Fuel", thisMonthMinorUnits: 0, averageMonthlyMinorUnits: 2_000 },
      ],
    );
    expect(unbudgetedCategories(data).map((row) => row.category)).toEqual(["Fuel"]);
  });
});

describe("suggestedLimitMinorUnits", () => {
  it("rounds the monthly average up to a natural step", () => {
    const inr = (major: number) =>
      suggestedLimitMinorUnits({ averageMonthlyMinorUnits: major * 100, thisMonthMinorUnits: 0 }, "INR");
    expect(inr(740)).toBe(80_000); // ₹800
    expect(inr(7_240)).toBe(750_000); // ₹7,500
    expect(inr(23_100)).toBe(2_400_000); // ₹24,000
  });

  it("falls back to this month, and suggests nothing with no spend", () => {
    expect(suggestedLimitMinorUnits({ averageMonthlyMinorUnits: 0, thisMonthMinorUnits: 45_000 }, "INR")).toBe(
      50_000,
    );
    expect(suggestedLimitMinorUnits({ averageMonthlyMinorUnits: 0, thisMonthMinorUnits: 0 }, "INR")).toBeNull();
  });
});

describe("parseLimitInput", () => {
  it("reads typed amounts exactly", () => {
    expect(parseLimitInput("8000", "INR")).toBe(800_000);
    expect(parseLimitInput("8,000", "INR")).toBe(800_000);
    expect(parseLimitInput("₹ 8000.50", "INR")).toBe(800_050);
  });

  it("rejects empty, zero and malformed input", () => {
    expect(parseLimitInput("", "INR")).toBeNull();
    expect(parseLimitInput("0", "INR")).toBeNull();
    expect(parseLimitInput("8.005", "INR")).toBeNull();
    expect(parseLimitInput("1.2.3", "INR")).toBeNull();
  });
});
