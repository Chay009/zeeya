import type { InsightsOverviewQuery } from "@/lib/dashboard-data";

// Keys name WHAT a local read returns — never a revision or a timestamp.
// Freshness is lib/live-queries.ts's job: it invalidates the "local" root
// when a write commits or the day rolls over, and query functions read the
// clock themselves when they run. A timestamp in a key would make every
// mount a cache miss; a revision in a key would blank the screen on sync.

export const localQueryKeys = {
  homeReadModel: (currency: string) => ["local", "home-read-model", currency] as const,
  homeHighlights: (query: {
    currency: string;
    accountId?: string;
    recentLimit?: number;
    upcomingLimit?: number;
  }) =>
    [
      "local",
      "home-highlights",
      query.currency,
      query.accountId ?? "all",
      query.recentLimit ?? "default",
      query.upcomingLimit ?? "default",
    ] as const,
  insightsOverview: (query: Omit<InsightsOverviewQuery, "at">) =>
    [
      "local",
      "insights-overview",
      query.currency,
      query.dailyBudgetMinorUnits ?? "none",
      query.historyMonths ?? "default",
      query.limit ?? "default",
    ] as const,
  recentTransactions: (direction: "income" | "expense", currency: string, limit: number) =>
    ["local", "recent-transactions", "mapped", direction, currency, limit] as const,
  detail: (scope: "transaction" | "activity" | "subscription" | "detail", id: string) =>
    ["local", "detail", scope, id] as const,
  series: (name: string, deps: readonly unknown[]) => ["local", "series", name, ...deps] as const,
  // Scope (category · account · limit) sits at a fixed index so hooks can
  // compare it against a previous key without parsing.
  recentActivity: (scope: {
    category?: string;
    accountId?: string;
    limit?: number;
    from?: number;
    to?: number;
    transactionsOnly?: boolean;
  }) =>
    [
      "local",
      "recent-activity",
      [
        scope.category ?? "all",
        scope.accountId ?? "all-accounts",
        scope.limit ?? "default",
        scope.from ?? "",
        scope.to ?? "",
        scope.transactionsOnly ? "tx" : "",
      ].join(":"),
    ] as const,
  activityScope: (accountId: string) => ["local", "activity-scope", accountId] as const,
  accountCashflowScope: (accountId: string, currency: string) =>
    ["local", "account-cashflow-scope", accountId, currency] as const,
  subscriptionsCatalog: () => ["local", "subscriptions-catalog"] as const,
  dashboardCurrencies: () => ["local", "dashboard-currencies"] as const,
  dayTransactions: (dayStartMs: number, currency: string) =>
    ["local", "day-transactions", dayStartMs, currency] as const,
};
