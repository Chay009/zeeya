function asDate(at: number | Date): Date {
  return at instanceof Date ? at : new Date(at);
}

function pad(part: number): string {
  return String(part).padStart(2, "0");
}

/** Local midnight for the calendar day that contains `at`. */
export function startOfDay(at: number | Date = Date.now()): number {
  const date = asDate(at);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Local midnight on the first of the month that contains `at`. */
export function startOfMonth(at: number | Date): number {
  const date = asDate(at);
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

export function isSameMonth(left: number | Date, right: number | Date): boolean {
  const a = asDate(left);
  const b = asDate(right);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function daysInMonth(date: Date): number;
export function daysInMonth(year: number, monthIndex: number): number;
export function daysInMonth(yearOrDate: number | Date, monthIndex?: number): number {
  if (yearOrDate instanceof Date) {
    return new Date(yearOrDate.getFullYear(), yearOrDate.getMonth() + 1, 0).getDate();
  }
  return new Date(yearOrDate, (monthIndex ?? 0) + 1, 0).getDate();
}

/**
 * Moves by calendar days, keeping the clock time. Adding a multiple of
 * 24 hours is not the same thing on a daylight-saving boundary.
 */
export function addDays(at: number | Date, days: number): number {
  const date = asDate(at);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  ).getTime();
}

/**
 * Moves by calendar months and clamps the day to the target month
 * (31 Jan + 1 month is 28 or 29 Feb, not 2 or 3 Mar).
 */
export function addCalendarMonths(at: number | Date, months: number): number {
  const date = asDate(at);
  const target = new Date(
    date.getFullYear(),
    date.getMonth() + months,
    1,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  );
  target.setDate(Math.min(date.getDate(), daysInMonth(target)));
  return target.getTime();
}

/** Whole local calendar days from `from` to `to`. Positive when `to` is later. */
export function calendarDaysBetween(from: number | Date, to: number | Date): number {
  const start = asDate(startOfDay(from));
  const end = asDate(startOfDay(to));
  const utcStart = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const utcEnd = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((utcEnd - utcStart) / 86_400_000);
}

/** `yyyy-MM-dd` in the local calendar. This is the key react-native-calendars uses. */
export function localDateKey(at: number | Date): string {
  const date = asDate(at);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local midnight for a `yyyy-MM-dd` key, or null when the key is not that calendar day. */
export function parseLocalDateKey(dateKey: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date.getTime();
}

/** `yyyy-MM` for the local month that contains `at`. */
export function monthKey(at: number | Date): string {
  return localDateKey(at).slice(0, 7);
}
