import type { ParsedSms } from "@/lib/sms";
import { trxDirection } from "../../lib/transaction-direction";

export interface SpendingPoint {
  [key: string]: number;
  day: number;
  value: number;
}

export interface CategorySlice {
  [key: string]: string | number;
  label: string;
  value: number;
  color: string;
}

const CATEGORY_COLORS = ["#176b4d", "#48b98d", "#86d2b0", "#f2b36d", "#d97861", "#7a8f86"];

function amountOf(message: ParsedSms): number | null {
  if (!message.result.trx) return null;
  const value = Number.parseFloat(message.result.trx.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

export function primaryExpenseCurrency(messages: ParsedSms[]): string | null {
  const counts = new Map<string, number>();
  for (const message of messages) {
    if (trxDirection(message.result.trxTypeRich) !== "expense" || amountOf(message) === null)
      continue;
    const currency = message.result.currency ?? "INR";
    counts.set(currency, (counts.get(currency) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

export function buildSpendingSeries(
  messages: ParsedSms[],
  currency: string,
  now: Date = new Date(),
  days = 14,
): SpendingPoint[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1).getTime();
  const totals = new Map<number, number>();
  for (const message of messages) {
    if (message.date < start || trxDirection(message.result.trxTypeRich) !== "expense") continue;
    if ((message.result.currency ?? "INR") !== currency) continue;
    const amount = amountOf(message);
    if (amount === null) continue;
    const date = new Date(message.date);
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    totals.set(day, (totals.get(day) ?? 0) + amount);
  }

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1 + index);
    const day = date.getTime();
    return { day, value: totals.get(day) ?? 0 };
  });
}

export function buildCategorySlices(messages: ParsedSms[], currency: string): CategorySlice[] {
  const totals = new Map<string, number>();
  for (const message of messages) {
    if (trxDirection(message.result.trxTypeRich) !== "expense") continue;
    if ((message.result.currency ?? "INR") !== currency) continue;
    const amount = amountOf(message);
    if (amount === null) continue;
    const category = message.result.merchantCategory?.trim() || "Other";
    totals.set(category, (totals.get(category) ?? 0) + amount);
  }

  return [...totals]
    .sort((a, b) => b[1] - a[1])
    .slice(0, CATEGORY_COLORS.length)
    .map(([label, value], index) => ({ label, value, color: CATEGORY_COLORS[index]! }));
}
