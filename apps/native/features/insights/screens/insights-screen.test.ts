import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const screenPath = path.join(__dirname, "insights-screen.tsx");
const sheetsPath = path.join(__dirname, "..", "components", "analytics-detail-sheets.tsx");
const componentsDir = path.join(__dirname, "..", "components");

describe("Insights screen composition", () => {
  it("composes hero + breakdown + detail sheets from useInsightsScreen", () => {
    const source = readFileSync(screenPath, "utf8");
    const sheets = readFileSync(sheetsPath, "utf8");

    expect(source).toContain("useInsightsScreen");
    expect(source).toContain("AnalyticsHeroCard");
    expect(source).toContain("AnalyticsBreakdownCard");
    expect(source).toContain("AnalyticsBudgetCard");
    expect(source).toContain("AnalyticsDetailSheets");
    expect(source).toContain("formatAnalyticsPeriod");
    expect(source).toContain("TransactionRow");
    expect(source).not.toMatch(/^function Panel\(/m);
    // Spending is the product word; "Outcome" never reaches the UI.
    expect(source).not.toContain('"Outcome"');

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
