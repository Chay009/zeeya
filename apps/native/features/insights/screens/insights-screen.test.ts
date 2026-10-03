import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const screenPath = path.join(__dirname, "insights-screen.tsx");
const sheetsPath = path.join(__dirname, "..", "components", "analytics-detail-sheets.tsx");
const componentsDir = path.join(__dirname, "..", "components");

describe("Insights screen composition", () => {
  it("composes titled cards: the number + chart, highlights, where it went, spending, latest", () => {
    const source = readFileSync(screenPath, "utf8");
    const sheets = readFileSync(sheetsPath, "utf8");

    expect(source).toContain("useInsightsScreen");
    // Simple by design: no dark chip band or layered sheets.
    expect(source).not.toContain("ChipBand");
    for (const part of [
      "Card",
      "HighlightsGrid",
      "CategoryChangeList",
      "VendorRankList",
      "IncomeSourcesList",
      "SoftBarChart",
      "SpendingRing",
      "LedgerRow",
      "AnalyticsBudgetCard",
      "MessageInsightsSection",
      "AnalyticsDetailSheets",
      "formatMonthToDate",
    ]) {
      expect(source).toContain(part);
    }
    expect(source).not.toMatch(/^function Panel\(/m);
    // The chips and links open the four core sheets.
    for (const sheet of ['"categories"', '"subscriptions"', '"transactions"', '"vendors"']) {
      expect(source).toContain(`openSheet(${sheet}`);
    }

    expect(sheets).toContain("AnalyticsCategoriesSheetContent");
    expect(sheets).toContain("AnalyticsTransactionsSheetContent");
    expect(sheets).toContain("AnalyticsSubscriptionsSheetContent");
    expect(sheets).toContain("AnalyticsVendorsSheetContent");

    // Legacy panels remain in the repo for reuse — not deleted.
    expect(existsSync(path.join(componentsDir, "category-panel.tsx"))).toBe(true);
    expect(existsSync(path.join(componentsDir, "transactions-panel.tsx"))).toBe(true);
    expect(existsSync(path.join(componentsDir, "insights-overview-panels.tsx"))).toBe(true);
    expect(existsSync(path.join(componentsDir, "analytics-series-panel.tsx"))).toBe(true);
    expect(existsSync(path.join(componentsDir, "insights-overview.tsx"))).toBe(true);
  });
});
