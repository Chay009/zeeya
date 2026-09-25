import { describe, expect, it } from "vitest";

import {
  elapsedDaysInCurrentMonth,
  INSIGHTS_TIME_SCOPES,
  scopeLabel,
  usesDailySeries,
} from "./analytics-scope";

describe("insights time scope", () => {
  it("offers bounded, product-facing labels", () => {
    expect(INSIGHTS_TIME_SCOPES.map((scope) => scope.label)).toEqual(["This month", "6 months"]);
    expect(INSIGHTS_TIME_SCOPES.map((scope) => scope.detail)).toEqual([
      "Daily view",
      "Monthly trend",
    ]);
    expect(scopeLabel("month")).toBe("This month");
    expect(scopeLabel("sixMonths")).toBe("6 months");
  });

  it("uses the elapsed days in the current calendar month for the daily view", () => {
    expect(elapsedDaysInCurrentMonth(new Date(2026, 0, 1, 12))).toBe(1);
    expect(elapsedDaysInCurrentMonth(new Date(2026, 7, 25, 12))).toBe(25);
    expect(usesDailySeries("month")).toBe(true);
    expect(usesDailySeries("sixMonths")).toBe(false);
  });
});
