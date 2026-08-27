export interface CalendarRangeSelection {
  from: string;
  to: string | null;
}

export function selectCalendarDay(
  current: CalendarRangeSelection | null,
  date: string,
): CalendarRangeSelection {
  if (!current || current.to) return { from: date, to: null };
  if (date < current.from) return { from: date, to: current.from };
  return { from: current.from, to: date };
}

function localDay(date: string): Date {
  const parts = date.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) {
    throw new Error(`Invalid calendar date: ${date}`);
  }
  const [year, month, day] = parts;
  const value = new Date(year!, month! - 1, day!);
  if (value.getFullYear() !== year || value.getMonth() !== month! - 1 || value.getDate() !== day) {
    throw new Error(`Invalid calendar date: ${date}`);
  }
  return value;
}

export function calendarSelectionToEpochRange(selection: CalendarRangeSelection): {
  from: number;
  to: number;
} {
  if (!selection.to) throw new Error("Choose an end date before starting a custom backfill.");
  const from = localDay(selection.from).getTime();
  const end = localDay(selection.to);
  end.setDate(end.getDate() + 1);
  return { from, to: end.getTime() - 1 };
}
