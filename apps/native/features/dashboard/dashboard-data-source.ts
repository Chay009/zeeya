import { ensureProjectionReadable, queryTransactionPage } from "@/db/ingestion";
import {
  queryCategoryTotals,
  queryDailySeries,
  queryDashboardAggregates,
  queryDistinctCurrencies,
  queryMonthlySeries,
  querySubscriptions,
} from "@/db/queries";
import {
  queryAccountScopeCounts,
  queryAccounts,
  queryBalanceHistory,
  queryDetectedAccounts,
  queryUnassignedReadings,
} from "@/db/queries-accounts";
import {
  queryMandate,
  queryMandateEvents,
  queryMandateEventsForMandates,
  queryMandates,
} from "@/db/queries-mandates";
import {
  queryActivityDetail,
  queryActivityPage,
  queryTransactionDetail,
} from "@/db/queries-transactions";
import { homeDataSource } from "@/db/queries-home";
import { queryInsightsOverview } from "@/db/queries-insights-overview";

import type { FinanceDataSource } from "@/lib/dashboard-data";

// Composition boundary for dashboard data. The local implementation is SQL
// today; replacing this object with a server-backed implementation later does
// not require changing Home or Insights.
export const financeDataSource: FinanceDataSource = {
  dashboard: {
    loadAggregates: async ({ currencies, at }) => {
      await ensureProjectionReadable();
      return queryDashboardAggregates(currencies, new Date(at));
    },
    listCurrencies: async () => {
      await ensureProjectionReadable();
      return queryDistinctCurrencies();
    },
  },
  accounts: {
    list: queryAccounts,
    listDetected: queryDetectedAccounts,
    scopeCounts: queryAccountScopeCounts,
    listUnassignedReadings: queryUnassignedReadings,
    listBalanceHistory: queryBalanceHistory,
  },
  transactions: {
    list: queryTransactionPage,
    get: queryTransactionDetail,
  },
  activity: {
    list: queryActivityPage,
    get: queryActivityDetail,
  },
  mandates: {
    list: queryMandates,
    get: queryMandate,
    listEvents: queryMandateEvents,
    listRecentEventsFor: queryMandateEventsForMandates,
  },
  subscriptions: {
    list: async ({ at } = {}) => {
      await ensureProjectionReadable();
      return querySubscriptions(at !== undefined ? new Date(at) : new Date());
    },
  },
  insights: {
    loadOverview: queryInsightsOverview,
    loadDailySeries: async ({ currency, direction, at, days }) => {
      await ensureProjectionReadable();
      return queryDailySeries(currency, direction, new Date(at), days);
    },
    loadMonthlySeries: async ({ currency, direction, at, months }) => {
      await ensureProjectionReadable();
      return queryMonthlySeries(currency, direction, new Date(at), months);
    },
    loadCategoryTotals: async ({ currency, at }) => {
      await ensureProjectionReadable();
      return queryCategoryTotals(currency, new Date(at));
    },
  },
  home: homeDataSource,
};
