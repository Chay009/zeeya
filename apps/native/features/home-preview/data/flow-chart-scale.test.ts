import { describe, expect, it } from "vitest";

import {
  chartYAxisTicks,
  compactAxisLabel,
  flowBarHeight,
  hasFlowChartActivity,
  niceChartMax,
  presentFlowChart,
} from "./flow-chart-scale";

describe("flow-chart-scale", () => {
  it("builds a single days[] model with scale metadata", () => {
    const chart = presentFlowChart([
      { income: 1200, expense: 800, active: false, label: "Mon" },
      { income: 0, expense: 2400, active: true, label: "Tue" },
    ]);

    expect(chart.scale.max).toBeGreaterThanOrEqual(2400);
    expect(chart.scale.ticks[0]).toBe(0);
    expect(chart.days).toHaveLength(2);
    expect(chart.days[1]?.expense.amount).toBe(2400);
    expect(chart.days[0]?.income.amount).toBe(1200);
    expect(flowBarHeight(2400, chart.scale.max)).toBeGreaterThan(
      flowBarHeight(800, chart.scale.max),
    );
    expect(hasFlowChartActivity(chart)).toBe(true);
  });

  it("formats compact INR axis labels", () => {
    expect(compactAxisLabel(0, "INR")).toBe("₹0");
    expect(compactAxisLabel(2500, "INR")).toBe("₹2.5K");
    expect(compactAxisLabel(125_000, "INR")).toBe("₹1.3L");
    expect(compactAxisLabel(10_000_000, "INR")).toBe("₹1Cr");
  });

  it("returns a non-zero chart max for empty weeks", () => {
    expect(niceChartMax(0)).toBe(1);
    expect(chartYAxisTicks(1)[0]).toBe(0);
    expect(chartYAxisTicks(1).at(-1)).toBeGreaterThanOrEqual(1);
    expect(hasFlowChartActivity(presentFlowChart([]))).toBe(false);
  });
});
