import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  ensureCurrent: vi.fn(async () => undefined),
  queryTransactions: vi.fn(async () => ({ items: [], nextCursor: null })),
  queryAggregates: vi.fn(async () => ({
    monthTotals: { incomeByCurrency: {}, expenseByCurrency: {} },
    categoryTotalsByCurrency: {},
  })),
  queryCurrencies: vi.fn(async () => [] as string[]),
  queryAccounts: vi.fn(async () => []),
  queryDetectedAccounts: vi.fn(async () => []),
  queryAccountScopeCounts: vi.fn(async () => ({ confirmedCount: 0, detectedCount: 0 })),
  queryBalanceHistory: vi.fn(async () => ({ items: [], nextCursor: null })),
  queryUnassignedReadings: vi.fn(async () => ({ items: [], nextCursor: null })),
  queryTransactionDetail: vi.fn(async () => null),
  queryActivityPage: vi.fn(async () => ({ items: [], nextCursor: null })),
  queryActivityDetail: vi.fn(async () => null),
  queryMandates: vi.fn(async () => ({ items: [], nextCursor: null })),
  queryMandateEvents: vi.fn(async () => ({ items: [], nextCursor: null })),
  queryMandateEventsForMandates: vi.fn(async () => new Map()),
  querySubscriptions: vi.fn(async () => []),
  queryDailySeries: vi.fn(async () => []),
  queryMonthlySeries: vi.fn(async () => []),
  queryCategoryTotals: vi.fn(async () => []),
  queryInsightsOverview: vi.fn(async () => ({}) as never),
  homeDataSource: {
    load: vi.fn(async () => ({}) as never),
    loadHighlights: vi.fn(async () => ({}) as never),
    loadCalendarMonths: vi.fn(async () => ({ items: [], nextCursor: null })),
    loadRecentActivity: vi.fn(async () => []),
    loadActivityScope: vi.fn(async () => ({
      categoryCounts: [],
      totalActivityCount: 0,
    })),
    loadAccountCashflowScope: vi.fn(async () => ({
      flowDays: [],
      incomeMinorUnits: 0,
      expenseMinorUnits: 0,
      categoryTotals: [],
      calendarMonths: { items: [], nextCursor: null },
    })),
  },
}));

vi.mock("@/db/ingestion", () => ({
  ensureDashboardProjectionCurrent: dependencies.ensureCurrent,
  queryTransactionPage: dependencies.queryTransactions,
}));

vi.mock("@/db/queries", () => ({
  queryDashboardAggregates: dependencies.queryAggregates,
  queryDistinctCurrencies: dependencies.queryCurrencies,
  querySubscriptions: dependencies.querySubscriptions,
  queryDailySeries: dependencies.queryDailySeries,
  queryMonthlySeries: dependencies.queryMonthlySeries,
  queryCategoryTotals: dependencies.queryCategoryTotals,
}));

vi.mock("@/db/queries-accounts", () => ({
  queryAccounts: dependencies.queryAccounts,
  queryDetectedAccounts: dependencies.queryDetectedAccounts,
  queryAccountScopeCounts: dependencies.queryAccountScopeCounts,
  queryBalanceHistory: dependencies.queryBalanceHistory,
  queryUnassignedReadings: dependencies.queryUnassignedReadings,
}));

vi.mock("@/db/queries-mandates", () => ({
  queryMandates: dependencies.queryMandates,
  queryMandateEvents: dependencies.queryMandateEvents,
  queryMandateEventsForMandates: dependencies.queryMandateEventsForMandates,
}));

vi.mock("@/db/queries-transactions", () => ({
  queryTransactionDetail: dependencies.queryTransactionDetail,
  queryActivityPage: dependencies.queryActivityPage,
  queryActivityDetail: dependencies.queryActivityDetail,
}));

vi.mock("@/db/queries-home", () => ({
  homeDataSource: dependencies.homeDataSource,
}));

vi.mock("@/db/queries-insights-overview", () => ({
  queryInsightsOverview: dependencies.queryInsightsOverview,
}));

const { financeDataSource } = await import("./dashboard-data-source");

describe("dashboardDataSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("repairs an interrupted projection before querying dashboard aggregates", async () => {
    const calls: string[] = [];
    dependencies.ensureCurrent.mockImplementationOnce(async () => {
      calls.push("ensure");
    });
    dependencies.queryAggregates.mockImplementationOnce(async () => {
      calls.push("query");
      return {
        monthTotals: { incomeByCurrency: {}, expenseByCurrency: {} },
        categoryTotalsByCurrency: {},
      };
    });

    await financeDataSource.dashboard.loadAggregates({ currencies: ["INR"], at: 0 });

    expect(calls).toEqual(["ensure", "query"]);
  });

  it("exposes transaction paging behind the same storage-neutral boundary", async () => {
    await financeDataSource.transactions.list({ currency: "INR", limit: 25 });

    expect(dependencies.queryTransactions).toHaveBeenCalledWith({ currency: "INR", limit: 25 });
  });

  it("repairs an interrupted projection before listing currencies", async () => {
    const calls: string[] = [];
    dependencies.ensureCurrent.mockImplementationOnce(async () => {
      calls.push("ensure");
    });
    dependencies.queryCurrencies.mockImplementationOnce(async () => {
      calls.push("query");
      return ["INR", "USD"];
    });

    const currencies = await financeDataSource.dashboard.listCurrencies();

    expect(calls).toEqual(["ensure", "query"]);
    expect(currencies).toEqual(["INR", "USD"]);
  });

  it("exposes the account family behind the same storage-neutral boundary", async () => {
    await financeDataSource.accounts.list();
    await financeDataSource.accounts.listDetected();
    await financeDataSource.accounts.listBalanceHistory({ accountId: "hdfc bank|1234" });
    await financeDataSource.accounts.listUnassignedReadings({ bankName: "HDFC Bank" });

    expect(dependencies.queryAccounts).toHaveBeenCalledWith();
    expect(dependencies.queryDetectedAccounts).toHaveBeenCalledWith();
    expect(dependencies.queryBalanceHistory).toHaveBeenCalledWith({ accountId: "hdfc bank|1234" });
    expect(dependencies.queryUnassignedReadings).toHaveBeenCalledWith({ bankName: "HDFC Bank" });
  });

  it("exposes single-transaction detail behind the same storage-neutral boundary", async () => {
    await financeDataSource.transactions.get("trx-1");

    expect(dependencies.queryTransactionDetail).toHaveBeenCalledWith("trx-1");
  });

  it("exposes activity paging behind the same storage-neutral boundary", async () => {
    await financeDataSource.activity.list({ category: "GRM_TRAVEL", limit: 10 });

    expect(dependencies.queryActivityPage).toHaveBeenCalledWith({
      category: "GRM_TRAVEL",
      limit: 10,
    });
  });

  it("exposes single-activity detail behind the same storage-neutral boundary", async () => {
    await financeDataSource.activity.get("sms-1|GRM_TRAVEL");

    expect(dependencies.queryActivityDetail).toHaveBeenCalledWith("sms-1|GRM_TRAVEL");
  });

  it("exposes the mandate family behind the same storage-neutral boundary", async () => {
    await financeDataSource.mandates.list({ limit: 25 });
    await financeDataSource.mandates.listEvents({ mandateId: "UMN123" });
    await financeDataSource.mandates.listRecentEventsFor(["UMN123", "UMN456"], 30);

    expect(dependencies.queryMandates).toHaveBeenCalledWith({ limit: 25 });
    expect(dependencies.queryMandateEvents).toHaveBeenCalledWith({ mandateId: "UMN123" });
    expect(dependencies.queryMandateEventsForMandates).toHaveBeenCalledWith(["UMN123", "UMN456"], 30);
  });

  it("repairs an interrupted projection before listing subscriptions, defaulting `at` to now", async () => {
    const calls: string[] = [];
    dependencies.ensureCurrent.mockImplementationOnce(async () => {
      calls.push("ensure");
    });
    dependencies.querySubscriptions.mockImplementationOnce(async () => {
      calls.push("query");
      return [];
    });

    await financeDataSource.subscriptions.list();

    expect(calls).toEqual(["ensure", "query"]);
  });

  it("passes an explicit `at` through to querySubscriptions as a Date", async () => {
    await financeDataSource.subscriptions.list({ at: 5000 });

    expect(dependencies.querySubscriptions).toHaveBeenCalledWith(new Date(5000));
  });

  it("repairs an interrupted projection before loading each insights series/totals", async () => {
    await financeDataSource.insights.loadDailySeries({
      currency: "INR",
      direction: "expense",
      at: 1000,
      days: 7,
    });
    await financeDataSource.insights.loadMonthlySeries({
      currency: "INR",
      direction: "expense",
      at: 1000,
      months: 3,
    });
    await financeDataSource.insights.loadCategoryTotals({ currency: "INR", at: 1000 });

    expect(dependencies.ensureCurrent).toHaveBeenCalledTimes(3);
    expect(dependencies.queryDailySeries).toHaveBeenCalledWith("INR", "expense", new Date(1000), 7);
    expect(dependencies.queryMonthlySeries).toHaveBeenCalledWith(
      "INR",
      "expense",
      new Date(1000),
      3,
    );
    expect(dependencies.queryCategoryTotals).toHaveBeenCalledWith("INR", new Date(1000));
  });

  it("exposes the composed insights overview through its snapshot-owning query", async () => {
    const query = {
      currency: "INR",
      at: 1000,
      dailyBudgetMinorUnits: 50_000,
      historyMonths: 6,
    };

    await financeDataSource.insights.loadOverview(query);

    expect(dependencies.queryInsightsOverview).toHaveBeenCalledWith(query);
  });

  it("exposes the Home read model behind the same storage-neutral boundary", () => {
    expect(financeDataSource.home).toBe(dependencies.homeDataSource);
  });

  it("keeps every public Home method wired through FinanceDataSource", async () => {
    const loadQuery = { currency: "INR", at: 1000 };
    const highlightsQuery = { currency: "INR", at: 1000, recentLimit: 3 };
    const calendarQuery = { currency: "INR", at: 1000, monthsBack: 3 };
    const recentQuery = { category: "GRM_TRAVEL" as const, limit: 5, at: 1000 };

    await financeDataSource.home.load(loadQuery);
    await financeDataSource.home.loadHighlights(highlightsQuery);
    await financeDataSource.home.loadCalendarMonths(calendarQuery);
    await financeDataSource.home.loadRecentActivity(recentQuery);

    expect(dependencies.homeDataSource.load).toHaveBeenCalledWith(loadQuery);
    expect(dependencies.homeDataSource.loadHighlights).toHaveBeenCalledWith(highlightsQuery);
    expect(dependencies.homeDataSource.loadCalendarMonths).toHaveBeenCalledWith(calendarQuery);
    expect(dependencies.homeDataSource.loadRecentActivity).toHaveBeenCalledWith(recentQuery);
  });
});
