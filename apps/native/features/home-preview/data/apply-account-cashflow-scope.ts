import { formatMoney } from "../../dashboard/utils/format";
import { fromMinorUnits } from "../../../lib/currency";
import type { HomeAccountCashflowScope } from "../../../lib/dashboard-data";

import type { HomePreviewDataFromReadModel } from "./types";
import { presentHomeCalendarMonths, presentHomeCategories, presentHomeFlowDays } from "./read-model-preview";

export function applyAccountCashflowScope(
  homeData: HomePreviewDataFromReadModel,
  scope: HomeAccountCashflowScope,
  currency: string,
  at: Date = new Date(),
): HomePreviewDataFromReadModel {
  const flowChart = presentHomeFlowDays(scope.flowDays, currency, at);
  const income = formatMoney(fromMinorUnits(scope.incomeMinorUnits, currency), currency);
  const expense = formatMoney(fromMinorUnits(scope.expenseMinorUnits, currency), currency);

  return {
    ...homeData,
    cashflow: {
      ...homeData.cashflow,
      income,
      expense,
      flowChart,
      categories: presentHomeCategories(scope.categoryTotals, currency),
      calendarMonths: presentHomeCalendarMonths(scope.calendarMonths.items, at, currency, true),
    },
    budget: {
      ...homeData.budget,
      spent: expense,
    },
  };
}
