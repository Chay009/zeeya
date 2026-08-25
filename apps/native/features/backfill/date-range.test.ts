import { describe, expect, it } from "vitest";

import { calendarSelectionToEpochRange, selectCalendarDay } from "./date-range";

describe("custom backfill calendar range", () => {
  it("starts a range, completes it, then starts a fresh range", () => {
    const started = selectCalendarDay(null, "2026-08-10");
    expect(started).toEqual({ from: "2026-08-10", to: null });
    const completed = selectCalendarDay(started, "2026-08-20");
    expect(completed).toEqual({ from: "2026-08-10", to: "2026-08-20" });
    expect(selectCalendarDay(completed, "2026-08-25")).toEqual({
      from: "2026-08-25",
      to: null,
    });
  });

  it("normalizes an end date selected before the start date", () => {
    expect(selectCalendarDay({ from: "2026-08-20", to: null }, "2026-08-10")).toEqual({
      from: "2026-08-10",
      to: "2026-08-20",
    });
  });

  it("converts selected local calendar days to an inclusive epoch range", () => {
    const range = calendarSelectionToEpochRange({ from: "2026-08-10", to: "2026-08-10" });
    expect(new Date(range.from).getDate()).toBe(10);
    expect(range.to - range.from).toBe(24 * 60 * 60 * 1000 - 1);
  });

  it("rejects an incomplete range", () => {
    expect(() => calendarSelectionToEpochRange({ from: "2026-08-10", to: null })).toThrow(
      /end date/,
    );
  });
});
