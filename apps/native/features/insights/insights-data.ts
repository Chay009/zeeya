import { parseDecimalAmount } from "@zeeya/parser/normalize";

import type { ParsedSms } from "@/lib/sms";
import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import { fromMinorUnits } from "../../lib/currency";
import type { CategoryTotal } from "../../lib/dashboard-data";
import { transactionCategoryLabel } from "../../lib/transaction-category";
import { trxDirection, type TrxDirection } from "../../lib/transaction-direction";

export interface SpendingPoint {
  [key: string]: number;
  day: number;
  value: number;
}

export interface MonthlyValue {
  monthStart: number;
  label: string;
  value: number;
  isCurrent: boolean;
}

export interface CategorySlice {
  [key: string]: string | number;
  label: string;
  value: number;
  color: string;
}

const CATEGORY_COLORS = ["#4f46e5", "#22a879", "#eab308", "#f97316", "#38aee8", "#c7c9d0"];

function amountOf(message: ParsedSms): number | null {
  return parseDecimalAmount(message.result.trx);
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

function buildDirectionSeries(
  messages: ParsedSms[],
  currency: string,
  direction: Exclude<TrxDirection, "neutral">,
  now: Date = new Date(),
  days = 14,
): SpendingPoint[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1).getTime();
  const totals = new Map<number, number>();
  for (const message of messages) {
    if (message.date < start || trxDirection(message.result.trxTypeRich) !== direction) continue;
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

export function buildSpendingSeries(
  messages: ParsedSms[],
  currency: string,
  now: Date = new Date(),
  days = 14,
): SpendingPoint[] {
  return buildDirectionSeries(messages, currency, "expense", now, days);
}

export function buildIncomeSeries(
  messages: ParsedSms[],
  currency: string,
  now: Date = new Date(),
  days = 14,
): SpendingPoint[] {
  return buildDirectionSeries(messages, currency, "income", now, days);
}

function buildMonthlyDirectionSeries(
  messages: ParsedSms[],
  currency: string,
  direction: Exclude<TrxDirection, "neutral">,
  now: Date = new Date(),
  months = 6,
): MonthlyValue[] {
  const count = Math.max(1, Math.floor(months));

  return Array.from({ length: count }, (_, index) => {
    const monthOffset = index - count + 1;
    const monthStart = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const nextMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);

    return {
      monthStart: monthStart.getTime(),
      label: monthStart.toLocaleDateString("en-US", { month: "short" }),
      value: monthTotal(messages, currency, direction, monthStart, nextMonthStart),
      isCurrent: monthOffset === 0,
    };
  });
}

export function buildMonthlySpendSeries(
  messages: ParsedSms[],
  currency: string,
  now: Date = new Date(),
  months = 6,
): MonthlyValue[] {
  return buildMonthlyDirectionSeries(messages, currency, "expense", now, months);
}

export function buildMonthlyIncomeSeries(
  messages: ParsedSms[],
  currency: string,
  now: Date = new Date(),
  months = 6,
): MonthlyValue[] {
  return buildMonthlyDirectionSeries(messages, currency, "income", now, months);
}

function buildCategorySlicesForDirection(
  messages: ParsedSms[],
  currency: string,
  direction: Exclude<TrxDirection, "neutral">,
): CategorySlice[] {
  const totals = new Map<string, number>();
  for (const message of messages) {
    if (trxDirection(message.result.trxTypeRich) !== direction) continue;
    if ((message.result.currency ?? "INR") !== currency) continue;
    const amount = amountOf(message);
    if (amount === null) continue;
    const category = transactionCategoryLabel(
      message.result.merchantCategory,
      message.result.subcategory,
    );
    totals.set(category, (totals.get(category) ?? 0) + amount);
  }

  return [...totals]
    .sort((a, b) => b[1] - a[1])
    .slice(0, CATEGORY_COLORS.length)
    .map(([label, value], index) => ({ label, value, color: CATEGORY_COLORS[index]! }));
}

export function buildCategorySlices(messages: ParsedSms[], currency: string): CategorySlice[] {
  return buildCategorySlicesForDirection(messages, currency, "expense");
}

export function buildCategorySlicesFromAggregate(
  rows: CategoryTotal[],
  currency: string,
): CategorySlice[] {
  return rows.slice(0, CATEGORY_COLORS.length).map((row, index) => ({
    label: row.category,
    value: fromMinorUnits(row.totalMinorUnits, currency),
    color: CATEGORY_COLORS[index]!,
  }));
}

export function buildIncomeCategorySlices(
  messages: ParsedSms[],
  currency: string,
): CategorySlice[] {
  return buildCategorySlicesForDirection(messages, currency, "income");
}

function monthTotal(
  messages: ParsedSms[],
  currency: string,
  direction: Exclude<TrxDirection, "neutral">,
  monthStart: Date,
  monthEnd: Date,
): number {
  let total = 0;
  for (const message of messages) {
    if (message.date < monthStart.getTime() || message.date >= monthEnd.getTime()) continue;
    if (trxDirection(message.result.trxTypeRich) !== direction) continue;
    if ((message.result.currency ?? "INR") !== currency) continue;
    const amount = amountOf(message);
    if (amount === null) continue;
    total += amount;
  }
  return total;
}

export interface MonthlySpendComparison {
  currentTotal: number;
  previousTotal: number;
  // null when there's no prior-month spend to compare against — a 0%
  // or "+inf%" figure would misrepresent "no prior data" as "no change"
  // or "infinite growth."
  percentChange: number | null;
}

export function monthlyComparisonFromMinorUnits(
  currentMinorUnits: number,
  previousMinorUnits: number,
  currency: string,
): MonthlySpendComparison {
  const percentChange =
    previousMinorUnits === 0
      ? null
      : ((currentMinorUnits - previousMinorUnits) / previousMinorUnits) * 100;

  return {
    currentTotal: fromMinorUnits(currentMinorUnits, currency),
    previousTotal: fromMinorUnits(previousMinorUnits, currency),
    percentChange,
  };
}

// Real month-over-month comparison from full message history (dashboard
// data holds every captured message, not just the current month — see
// deriveDashboard in lib/dashboard.ts) — never a fabricated or estimated
// percentage.
export function buildMonthlyDirectionComparison(
  messages: ParsedSms[],
  currency: string,
  direction: Exclude<TrxDirection, "neutral">,
  now: Date = new Date(),
): MonthlySpendComparison {
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const currentTotal = monthTotal(messages, currency, direction, currentMonthStart, nextMonthStart);
  const previousTotal = monthTotal(
    messages,
    currency,
    direction,
    previousMonthStart,
    currentMonthStart,
  );
  const percentChange =
    previousTotal === 0 ? null : ((currentTotal - previousTotal) / previousTotal) * 100;

  return { currentTotal, previousTotal, percentChange };
}

export function buildMonthlySpendComparison(
  messages: ParsedSms[],
  currency: string,
  now: Date = new Date(),
): MonthlySpendComparison {
  return buildMonthlyDirectionComparison(messages, currency, "expense", now);
}

export function buildMonthlyIncomeComparison(
  messages: ParsedSms[],
  currency: string,
  now: Date = new Date(),
): MonthlySpendComparison {
  return buildMonthlyDirectionComparison(messages, currency, "income", now);
}

export interface TopCategory {
  label: string;
  value: number;
  color: string;
}

// The single largest expense category this month — same totals
// buildCategorySlices already computes, just narrowed to the top one for
// a compact tile instead of the full donut breakdown.
export function buildTopCategory(messages: ParsedSms[], currency: string): TopCategory | null {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const inMonth = messages.filter((message) => message.date >= monthStart);
  const slices = buildCategorySlices(inMonth, currency);
  return slices[0] ?? null;
}

// ── SQL-backed equivalents ──────────────────────────────────────────────
// These replace the buildSpendingSeries/buildMonthlySpendSeries family for
// screens that no longer hold dashboard.recent — same output shape, same
// bucket boundaries (parity-tested in db/queries.test.ts against these
// exact JS functions), but reading only the bounded date window each query
// asks for instead of scanning the entire message history to answer it.

// Mirrors buildDirectionSeries's day-bucket shape ({ day, value }) so a
// chart fed by either source renders identically. Goes through
// financeDataSource.insights, not db/queries.ts's queryDailySeries
// directly — this module (like every other feature reading local data)
// depends only on the storage-neutral FinanceDataSource boundary, so a
// future server-backed data source needs no change here.
async function queryDirectionSeries(
  currency: string,
  direction: Exclude<TrxDirection, "neutral">,
  now: Date,
  days: number,
): Promise<SpendingPoint[]> {
  const rows = await financeDataSource.insights.loadDailySeries({
    currency,
    direction,
    at: now.getTime(),
    days,
  });
  return rows.map((row) => ({
    day: row.day,
    value: fromMinorUnits(row.totalMinorUnits, currency),
  }));
}

export function querySpendingSeries(
  currency: string,
  now: Date = new Date(),
  days = 14,
): Promise<SpendingPoint[]> {
  return queryDirectionSeries(currency, "expense", now, days);
}

export function queryIncomeSeries(
  currency: string,
  now: Date = new Date(),
  days = 14,
): Promise<SpendingPoint[]> {
  return queryDirectionSeries(currency, "income", now, days);
}

// Mirrors buildMonthlyDirectionSeries's shape, including `label` and
// `isCurrent` — both purely derived from `monthStart`, so they're
// recomputed here in JS rather than needing to come from SQL.
async function queryMonthlyDirectionSeries(
  currency: string,
  direction: Exclude<TrxDirection, "neutral">,
  now: Date,
  months: number,
): Promise<MonthlyValue[]> {
  const rows = await financeDataSource.insights.loadMonthlySeries({
    currency,
    direction,
    at: now.getTime(),
    months,
  });
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return rows.map((row) => ({
    monthStart: row.monthStart,
    label: new Date(row.monthStart).toLocaleDateString("en-US", { month: "short" }),
    value: fromMinorUnits(row.totalMinorUnits, currency),
    isCurrent: row.monthStart === currentMonthStart,
  }));
}

export function queryMonthlySpendSeries(
  currency: string,
  now: Date = new Date(),
  months = 6,
): Promise<MonthlyValue[]> {
  return queryMonthlyDirectionSeries(currency, "expense", now, months);
}

export function queryMonthlyIncomeSeries(
  currency: string,
  now: Date = new Date(),
  months = 6,
): Promise<MonthlyValue[]> {
  return queryMonthlyDirectionSeries(currency, "income", now, months);
}

export interface MonthlyDirectionComparisonQuery {
  currency: string;
  direction: Exclude<TrxDirection, "neutral">;
  now?: Date;
}

// Mirrors buildMonthlyDirectionComparison: current vs. previous calendar
// month, same currency and direction, over a bounded 2-month SQL window
// instead of the full message history.
export async function queryMonthlyDirectionComparison({
  currency,
  direction,
  now = new Date(),
}: MonthlyDirectionComparisonQuery): Promise<MonthlySpendComparison> {
  const rows = await financeDataSource.insights.loadMonthlySeries({
    currency,
    direction,
    at: now.getTime(),
    months: 2,
  });
  const previousTotal = fromMinorUnits(rows[0]?.totalMinorUnits ?? 0, currency);
  const currentTotal = fromMinorUnits(rows[1]?.totalMinorUnits ?? 0, currency);
  const percentChange =
    previousTotal === 0 ? null : ((currentTotal - previousTotal) / previousTotal) * 100;
  return { currentTotal, previousTotal, percentChange };
}
