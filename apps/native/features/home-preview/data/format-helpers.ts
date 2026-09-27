import { formatDate, formatMoney } from "../../dashboard/utils/format";
import { dateFormat } from "../../../lib/intl-format";
import { titleCase } from "../../../lib/transaction-category";

const SUBCATEGORY_LABELS: Record<string, string> = {
  upi: "UPI",
  neft: "NEFT",
  imps: "IMPS",
  rtgs: "RTGS",
  atm: "ATM",
  emi: "EMI",
};

export function subcategoryLabel(subcategory: string): string {
  return SUBCATEGORY_LABELS[subcategory.toLowerCase()] ?? titleCase(subcategory);
}

export function formatCurrencyTotals(record: Record<string, number>, visible: boolean): string {
  if (!visible) return "—";
  const parts = Object.entries(record)
    .sort(([left], [right]) =>
      left === "INR" ? -1 : right === "INR" ? 1 : left.localeCompare(right),
    )
    .map(([currency, amount]) => formatMoney(amount, currency));
  return parts.length > 0 ? parts.join(" + ") : "—";
}

export function formatMonthLabel(date: Date): string {
  return dateFormat("en-IN", { month: "short", year: "numeric" }).format(date);
}

export function formatActivityDate(timestamp: number): string {
  return `${formatDate(timestamp)} · ${dateFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp)}`;
}

export function formatDateHeading(date: Date): string {
  return dateFormat("en-IN", { day: "numeric", month: "short" }).format(date).toUpperCase();
}

export function formatSignedAmount(amount: number, currency: string): string {
  if (amount > 0) return `+${formatMoney(amount, currency)}`;
  if (amount < 0) return `−${formatMoney(Math.abs(amount), currency)}`;
  // Income and expense fully offset — neither a gain nor a loss, so it gets
  // its own explicit prefix rather than an unsigned amount that
  // compactCalendarNet's sign-sniffing would otherwise mistake for a
  // parse failure and silently miscolor as an expense.
  return `±${formatMoney(0, currency)}`;
}

export function monthKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function sameMonth(timestamp: number, date: Date): boolean {
  const value = new Date(timestamp);
  return value.getFullYear() === date.getFullYear() && value.getMonth() === date.getMonth();
}

export function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function formatCapturedChange(change: number, currency: string): string {
  if (change > 0) return `+${formatMoney(change, currency)}`;
  if (change < 0) return `−${formatMoney(Math.abs(change), currency)}`;
  return formatMoney(0, currency);
}

