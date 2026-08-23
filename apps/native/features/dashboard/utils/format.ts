// maximumFractionDigits: 2 (not a forced 0) so a ₹199.99 charge doesn't
// silently round to ₹200 — toLocaleString only prints decimals when the
// amount actually has them, so whole amounts still render without ".00".
export function formatMoney(amount: number, currency: string): string {
  const symbol = currency === "INR" ? "₹" : currency + " ";
  return `${symbol}${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
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
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(
    "en-IN",
    sameYear
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" },
  );
}

// Full precision (date + time + year, always) — used where telling two
// readings apart matters, since day/month alone can hide same-day-different-
// time orderings or make cross-year mixups look ambiguous.
export function formatDateTimeFull(ms: number): string {
  return new Date(ms).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
