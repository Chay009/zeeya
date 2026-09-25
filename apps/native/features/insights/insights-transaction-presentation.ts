import { formatDate, formatMoney } from "@/features/dashboard/utils/format";
import { merchantVisual } from "@/features/home-preview/data";
import { fromMinorUnits } from "@/lib/currency";
import type { TransactionSummary } from "@/lib/dashboard-data";

export interface InsightsTransactionRow {
  key: string;
  name: string;
  sub: string;
  amount: string | null;
  date: number;
  monthGroup: string;
  category: string;
  letter: string;
  tile: string;
  ink: string;
  img: string | null;
}

function formatMonthGroup(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

function transactionMerchantName(item: TransactionSummary): string {
  return (
    item.brandName?.trim() ||
    item.vendor?.trim() ||
    item.bankName?.trim() ||
    "Transaction"
  );
}

function formatActivitySubline(timestamp: number): string {
  return `${formatDate(timestamp)} · ${new Date(timestamp).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function formatTransactionAmount(item: TransactionSummary): string | null {
  if (item.direction === "neutral") return null;
  const amount = fromMinorUnits(item.amountMinorUnits, item.currency);
  const formatted = formatMoney(amount, item.currency);
  return item.direction === "income" ? `+ ${formatted}` : `- ${formatted}`;
}

function isInsightsTransactionRow(value: unknown): value is InsightsTransactionRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<InsightsTransactionRow>;
  return typeof row.key === "string" && typeof row.name === "string";
}

/** Boot cache and analytics hooks must map SQL rows before caching under TanStack keys. */
export function normalizeInsightsTransactionRows(
  rows: readonly unknown[],
): InsightsTransactionRow[] {
  return rows.map((row) =>
    isInsightsTransactionRow(row)
      ? row
      : mapInsightsTransactionRow(row as TransactionSummary),
  );
}

export function mapInsightsTransactionRow(item: TransactionSummary): InsightsTransactionRow {
  const name = transactionMerchantName(item);
  const style = merchantVisual(name, item.category);
  return {
    key: item.id,
    name,
    sub: formatActivitySubline(item.date),
    amount: formatTransactionAmount(item),
    date: item.date,
    monthGroup: formatMonthGroup(item.date),
    category: item.category ?? "",
    letter: name.charAt(0).toUpperCase() || "?",
    tile: style.tile,
    ink: style.ink,
    img: style.img ?? null,
  };
}
