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
  // Scope (category · account · limit) sits at a fixed index so hooks can
  // compare it against a previous key without parsing.
  recentActivity: (
    scope: { category?: string; accountId?: string; limit?: number },
    syncRevision: number,
  ) =>
    [
      "local",
      "recent-activity",
      `${scope.category ?? "all"}:${scope.accountId ?? "all-accounts"}:${scope.limit ?? "default"}`,
      syncRevision,
    ] as const,
  activityScope: (accountId: string, syncRevision: number) =>
    ["local", "activity-scope", accountId, syncRevision] as const,
  accountCashflowScope: (accountId: string, currency: string, at: number, syncRevision: number) =>
    ["local", "account-cashflow-scope", accountId, currency, at, syncRevision] as const,
  subscriptionsCatalog: (syncRevision: number) =>
    ["local", "subscriptions-catalog", syncRevision] as const,
  dashboardCurrencies: (syncRevision: number) =>
    ["local", "dashboard-currencies", syncRevision] as const,
  dayTransactions: (dayStartMs: number, currency: string, syncRevision: number) =>
    ["local", "day-transactions", dayStartMs, currency, syncRevision] as const,
};
