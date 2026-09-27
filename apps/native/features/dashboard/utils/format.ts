import { dateFormat, numberFormat } from "@/lib/intl-format";

// maximumFractionDigits: 2 (not a forced 0) so a ₹199.99 charge doesn't
// silently round to ₹200 — the formatter only prints decimals when the
// amount actually has them, so whole amounts still render without ".00".
// Cached formatter (lib/intl-format.ts): this runs per row and per calendar
// day, and toLocaleString built a fresh Intl formatter on every call.
const MONEY = numberFormat("en-IN", { maximumFractionDigits: 2 });

export function formatMoney(amount: number, currency: string): string {
  const symbol = currency === "INR" ? "₹ " : `${currency} `;
  return `${symbol}${MONEY.format(amount)}`;
}

// Axis labels and tight chart captions — not full precision formatMoney.
export function formatCompactMoney(amount: number, currency: string): string {
  const symbol = currency === "INR" ? "₹" : `${currency} `;
  const abs = Math.abs(amount);
  if (abs >= 100_000) {
    return `${symbol}${(abs / 100_000).toFixed(abs >= 1_000_000 ? 0 : 1)}L`;
  }
  if (abs >= 1_000) return `${symbol}${Math.round(abs / 1_000)}k`;
  if (abs === 0) return `${symbol}0`;
  return `${symbol}${Math.round(abs)}`;
}

// Currencies present across a set of per-currency totals, INR first (this
// app's primary currency) then the rest alphabetically — so a single-currency
// user always sees the familiar single row, and mixed-currency activity adds
// rows instead of being silently summed together.
export function currenciesOf(...records: Record<string, number>[]): string[] {
  const set = new Set<string>();
  for (const r of records) for (const k of Object.keys(r)) set.add(k);
  if (set.size === 0) set.add("INR");
  return [...set].sort((a, b) => (a === "INR" ? -1 : b === "INR" ? 1 : a.localeCompare(b)));
}

export function formatDate(ms: number): string {
  const sameYear = new Date(ms).getFullYear() === new Date().getFullYear();
  return dateFormat(
    "en-IN",
    sameYear
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" },
  ).format(ms);
}

// Full precision (date + time + year, always) — used where telling two
// readings apart matters, since day/month alone can hide same-day-different-
// time orderings or make cross-year mixups look ambiguous.
export function formatDateTimeFull(ms: number): string {
  return dateFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(ms);
}
