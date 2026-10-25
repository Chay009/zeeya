import { describe, expect, it } from "vitest";

import {
  addCalendarMonths,
  addDays,
  calendarDaysBetween,
  daysInMonth,
  localDateKey,
  monthKey,
  parseLocalDateKey,
  startOfDay,
} from "./calendar";

describe("calendar", () => {
  it("clamps a month move onto the last real day", () => {
    const january31 = new Date(2026, 0, 31, 15, 45).getTime();
    const february = new Date(addCalendarMonths(january31, 1));
    expect(february.getFullYear()).toBe(2026);
    expect(february.getMonth()).toBe(1);
    expect(february.getDate()).toBe(28);
    expect(february.getHours()).toBe(15);
    expect(february.getMinutes()).toBe(45);
  });

  it("moves by calendar days rather than a fixed 24-hour step", () => {
    const start = startOfDay(new Date(2026, 2, 7, 22).getTime());
    const next = new Date(addDays(start, 1));
    expect(next.getDate()).toBe(8);
    expect(next.getHours()).toBe(0);
    expect(calendarDaysBetween(start, next)).toBe(1);
  });

  it("formats and reads a local date key", () => {
    const at = new Date(2026, 9, 5, 18).getTime();
    expect(localDateKey(at)).toBe("2026-10-05");
    expect(monthKey(at)).toBe("2026-10");
    expect(parseLocalDateKey("2026-10-05")).toBe(startOfDay(at));
    expect(parseLocalDateKey("2026-02-31")).toBeNull();
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(daysInMonth(new Date(2024, 1, 10))).toBe(29);
  });
});
