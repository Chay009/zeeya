import { createMalanaEngine } from "@zeeya/parser/malana";
import { describe, expect, it, vi } from "vitest";

import type { ParsedSms } from "@/lib/sms";

// insights-data.ts now calls through @/features/dashboard/dashboard-data-source
// (financeDataSource.insights.*) rather than db/queries.ts directly — the
// storage-neutral boundary every other feature already goes through.
// dashboard-data-source.ts itself imports db/client.native.ts's real
// expo-sqlite connection transitively, which doesn't exist in this Node
// test environment, so the whole module is mocked here the same way
// stores/dashboard-store.test.ts mocks it — this suite only exercises the
// pure JS build* functions plus the thin SQL-backed adapters' own mapping
// logic, so the mocked insights.* functions are never actually called for
// real SQL.
const loadDailySeries = vi.fn();
const loadMonthlySeries = vi.fn();
vi.mock("@/features/dashboard/dashboard-data-source", () => ({
  financeDataSource: {
    insights: {
      loadDailySeries,
      loadMonthlySeries,
      loadCategoryTotals: vi.fn(),
    },
  },
}));

const {
  buildMonthlySpendSeries,
  buildSpendingSeries,
  primaryExpenseCurrency,
  querySpendingSeries,
  queryMonthlySpendSeries,
  monthlyComparisonFromMinorUnits,
  queryMonthlyDirectionComparison,
} = await import("./insights-data");

const engine = createMalanaEngine();

function expense(id: string, body: string, date: number): ParsedSms {
  return { id, sender: "VM-HDFCBK", body, date, result: engine.parse(body, "VM-HDFCBK") };
}

describe("insights data", () => {
  it("builds month-over-month comparisons from minor units", () => {
    expect(monthlyComparisonFromMinorUnits(15_000, 10_000, "INR")).toEqual({
      currentTotal: 150,
      previousTotal: 100,
      percentChange: 50,
    });
    expect(monthlyComparisonFromMinorUnits(5_000, 0, "INR").percentChange).toBeNull();
  });

  it("chooses a currency by financial-message frequency without mixing values", () => {
    const messages = [
      expense("1", "INR 10 debited from account XX1234", 1),
      expense("2", "INR 20 debited from account XX1234", 2),
      expense("3", "$5 debited from account XX1234", 3),
    ];
    expect(primaryExpenseCurrency(messages)).toBe("INR");
  });

  it("aggregates same-day expenses and excludes other currencies", () => {
    const now = new Date(2026, 7, 25, 12);
    const day = new Date(2026, 7, 25, 9).getTime();
    const messages = [
      expense("1", "INR 10 debited from account XX1234", day),
      expense("2", "INR 20 debited from account XX1234", day + 1),
      expense("3", "$5 debited from account XX1234", day + 2),
    ];
    const series = buildSpendingSeries(messages, "INR", now, 2);
    expect(series).toHaveLength(2);
    expect(series[1]!.value).toBe(30);
  });

  it("builds six real calendar-month totals and marks only the current month", () => {
    const now = new Date(2026, 7, 25, 12);
    const messages = [
      expense("july", "INR 10 debited from account XX1234", new Date(2026, 6, 8).getTime()),
      expense("august", "INR 20 debited from account XX1234", new Date(2026, 7, 8).getTime()),
      expense("other-currency", "$5 debited from account XX1234", new Date(2026, 7, 9).getTime()),
    ];

    const series = buildMonthlySpendSeries(messages, "INR", now, 3);

    expect(series.map((point) => point.label)).toEqual(["Jun", "Jul", "Aug"]);
    expect(series.map((point) => point.value)).toEqual([0, 10, 20]);
    expect(series.filter((point) => point.isCurrent)).toHaveLength(1);
    expect(series[2]!.isCurrent).toBe(true);
  });
});

// These adapters are thin by design — the real bucket-boundary correctness
// is parity-tested against the JS build* functions in db/queries.test.ts.
// What's under test here is just the mapping this file adds on top: minor
// units back to a display number, and the label/isCurrent/percentChange
// fields the SQL rows don't carry.
describe("SQL-backed adapters", () => {
  it("converts a daily series' minor units to display amounts, keeping each day's own timestamp", async () => {
    const day0 = new Date(2026, 7, 24).getTime();
    const day1 = new Date(2026, 7, 25).getTime();
    loadDailySeries.mockResolvedValueOnce([
      { day: day0, totalMinorUnits: 0 },
      { day: day1, totalMinorUnits: 3000 },
    ]);

    const series = await querySpendingSeries("INR", new Date(2026, 7, 25), 2);

    expect(loadDailySeries).toHaveBeenCalledWith({
      currency: "INR",
      direction: "expense",
      at: new Date(2026, 7, 25).getTime(),
      days: 2,
    });
    expect(series).toEqual([
      { day: day0, value: 0 },
      { day: day1, value: 30 },
    ]);
  });

  it("derives label and isCurrent from monthStart instead of needing them from SQL", async () => {
    const now = new Date(2026, 7, 25, 12);
    const july = new Date(2026, 6, 1).getTime();
    const august = new Date(2026, 7, 1).getTime();
    loadMonthlySeries.mockResolvedValueOnce([
      { monthStart: july, totalMinorUnits: 1000 },
      { monthStart: august, totalMinorUnits: 2000 },
    ]);

    const series = await queryMonthlySpendSeries("INR", now, 2);

    expect(loadMonthlySeries).toHaveBeenCalledWith({
      currency: "INR",
      direction: "expense",
      at: now.getTime(),
      months: 2,
    });
    expect(series).toEqual([
      { monthStart: july, label: "Jul", value: 10, isCurrent: false },
      { monthStart: august, label: "Aug", value: 20, isCurrent: true },
    ]);
  });

  it("computes percentChange from the two-month SQL window, null when there's no prior spend", async () => {
    const now = new Date(2026, 7, 25);
    loadMonthlySeries.mockResolvedValueOnce([
      { monthStart: new Date(2026, 6, 1).getTime(), totalMinorUnits: 10000 },
      { monthStart: new Date(2026, 7, 1).getTime(), totalMinorUnits: 15000 },
    ]);

    const comparison = await queryMonthlyDirectionComparison({
      currency: "INR",
      direction: "expense",
      now,
    });

    expect(loadMonthlySeries).toHaveBeenCalledWith({
      currency: "INR",
      direction: "expense",
      at: now.getTime(),
      months: 2,
    });
    expect(comparison).toEqual({ currentTotal: 150, previousTotal: 100, percentChange: 50 });
  });

  it("reports no previous-month total as null percentChange, not 0% or +Infinity%", async () => {
    loadMonthlySeries.mockResolvedValueOnce([
      { monthStart: new Date(2026, 6, 1).getTime(), totalMinorUnits: 0 },
      { monthStart: new Date(2026, 7, 1).getTime(), totalMinorUnits: 5000 },
    ]);

    const comparison = await queryMonthlyDirectionComparison({
      currency: "INR",
      direction: "expense",
      now: new Date(2026, 7, 25),
    });

    expect(comparison.percentChange).toBeNull();
  });
});
