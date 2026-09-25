import type { InsightsOverviewQuery } from "@/lib/dashboard-data";

export const localQueryKeys = {
  homeReadModel: (currency: string, syncRevision: number) =>
    ["local", "home-read-model", currency, syncRevision] as const,
  homeHighlights: (
    query: {
      currency: string;
      at: number;
      accountId?: string;
      recentLimit?: number;
      upcomingLimit?: number;
    },
    syncRevision: number,
  ) =>
    [
      "local",
      "home-highlights",
      query.currency,
      query.at,
      query.accountId ?? "all",
      query.recentLimit ?? "default",
      query.upcomingLimit ?? "default",
      syncRevision,
    ] as const,
  insightsOverview: (query: InsightsOverviewQuery, syncRevision: number) =>
    [
      "local",
      "insights-overview",
      query.currency,
      query.at,
      query.dailyBudgetMinorUnits ?? "none",
      query.historyMonths ?? "default",
      query.limit ?? "default",
      syncRevision,
    ] as const,
  recentTransactions: (
    direction: "income" | "expense",
    currency: string,
    limit: number,
    syncRevision: number,
  ) =>
    ["local", "recent-transactions", "mapped", direction, currency, limit, syncRevision] as const,
  detail: (
    scope: "transaction" | "activity" | "subscription" | "detail",
    id: string,
    syncRevision: number,
  ) => ["local", "detail", scope, id, syncRevision] as const,
  series: (name: string, syncRevision: number, deps: readonly unknown[]) =>
    ["local", "series", name, syncRevision, ...deps] as const,
};
