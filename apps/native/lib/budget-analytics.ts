import type { BudgetMonthPerformance, BudgetPerformance } from "./dashboard-data";

export interface DailySpendBucket {
  dayStart: number;
  spentMinorUnits: number;
}

export interface MonthlyDailySpend {
  monthStart: number;
  dailySpend: DailySpendBucket[];
}

function sameLocalMonth(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function evaluateMonth(
  month: MonthlyDailySpend,
  dailyBudgetMinorUnits: number,
  evaluatedDays: number,
): BudgetMonthPerformance {
  const spendByDay = new Map<number, number>();
  for (const bucket of month.dailySpend) {
    const day = new Date(bucket.dayStart).getDate();
    spendByDay.set(day, (spendByDay.get(day) ?? 0) + bucket.spentMinorUnits);
  }

  let spentMinorUnits = 0;
  let daysOverBudget = 0;
  for (let day = 1; day <= evaluatedDays; day++) {
    const spent = spendByDay.get(day) ?? 0;
    spentMinorUnits += spent;
    if (spent > dailyBudgetMinorUnits) daysOverBudget++;
  }
  const daysWithinBudget = evaluatedDays - daysOverBudget;
  return {
    monthStart: month.monthStart,
    budgetMinorUnits: dailyBudgetMinorUnits * daysInMonth(new Date(month.monthStart)),
    spentMinorUnits,
    daysWithinBudget,
    daysOverBudget,
    adherenceScore: Math.round((daysWithinBudget / evaluatedDays) * 100),
  };
}

function overBudgetDayStarts(
  month: MonthlyDailySpend,
  dailyBudgetMinorUnits: number,
  evaluatedDays: number,
): number[] {
  const spendByDay = new Map<number, number>();
  for (const bucket of month.dailySpend) {
    const day = new Date(bucket.dayStart).getDate();
    spendByDay.set(day, (spendByDay.get(day) ?? 0) + bucket.spentMinorUnits);
  }
  const monthDate = new Date(month.monthStart);
  return Array.from({ length: evaluatedDays }, (_, index) => index + 1)
    .filter((day) => (spendByDay.get(day) ?? 0) > dailyBudgetMinorUnits)
    .map((day) => new Date(monthDate.getFullYear(), monthDate.getMonth(), day).getTime());
}

export function computeBudgetPerformance(input: {
  at: number;
  dailyBudgetMinorUnits?: number;
  months: MonthlyDailySpend[];
}): BudgetPerformance | null {
  if (input.dailyBudgetMinorUnits === undefined) return null;
  if (!Number.isSafeInteger(input.dailyBudgetMinorUnits) || input.dailyBudgetMinorUnits <= 0) {
    throw new Error(
      `dailyBudgetMinorUnits must be a positive safe integer, got ${input.dailyBudgetMinorUnits}`,
    );
  }
  const now = new Date(input.at);
  if (!Number.isFinite(now.getTime()))
    throw new Error(`at must be a valid timestamp, got ${input.at}`);

  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const normalizedMonths = [...input.months].sort((a, b) => a.monthStart - b.monthStart);
  const months = normalizedMonths.map((month) => {
    const monthDate = new Date(month.monthStart);
    const evaluatedDays = sameLocalMonth(monthDate, now) ? now.getDate() : daysInMonth(monthDate);
    return evaluateMonth(month, input.dailyBudgetMinorUnits!, evaluatedDays);
  });
  const current =
    months.find((month) => month.monthStart === currentMonthStart) ??
    evaluateMonth(
      { monthStart: currentMonthStart, dailySpend: [] },
      input.dailyBudgetMinorUnits,
      now.getDate(),
    );
  const currentInput = normalizedMonths.find((month) => month.monthStart === currentMonthStart) ?? {
    monthStart: currentMonthStart,
    dailySpend: [],
  };
  const monthDays = daysInMonth(now);
  const averageDailySpendMinorUnits = Math.round(current.spentMinorUnits / now.getDate());

  return {
    dailyBudgetMinorUnits: input.dailyBudgetMinorUnits,
    currentMonthBudgetMinorUnits: current.budgetMinorUnits,
    currentMonthSpentMinorUnits: current.spentMinorUnits,
    elapsedDays: now.getDate(),
    daysWithinBudget: current.daysWithinBudget,
    daysOverBudget: current.daysOverBudget,
    adherenceScore: current.adherenceScore,
    averageDailySpendMinorUnits,
    projectedMonthSpendMinorUnits: averageDailySpendMinorUnits * monthDays,
    remainingMinorUnits: current.budgetMinorUnits - current.spentMinorUnits,
    usedPercent: Math.round((current.spentMinorUnits / current.budgetMinorUnits) * 100),
    months,
    overBudgetDayStarts: overBudgetDayStarts(
      currentInput,
      input.dailyBudgetMinorUnits,
      now.getDate(),
    ),
  };
}
