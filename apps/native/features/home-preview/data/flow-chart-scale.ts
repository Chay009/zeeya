import { formatCompactMoney } from "../../dashboard/utils/format";

export const FLOW_CHART_PLOT_HEIGHT = 103;
export const FLOW_CHART_Y_AXIS_WIDTH = 38;

export type FlowChartSeries = {
  amount: number;
  barHeight: number;
};

export type FlowChartDay = {
  label: string;
  active: boolean;
  income: FlowChartSeries;
  expense: FlowChartSeries;
};

export type FlowChartScale = {
  max: number;
  ticks: number[];
};

export type FlowChartModel = {
  days: FlowChartDay[];
  scale: FlowChartScale;
};

export type FlowDayValue = {
  income: number;
  expense: number;
  active: boolean;
  label: string;
};

function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

export function niceChartMax(value: number): number {
  if (value <= 0) return 1;
  const step = niceStep(value / 3);
  return Math.max(step, Math.ceil(value / step) * step);
}

export function chartYAxisTicks(chartMax: number, tickCount = 4): number[] {
  if (chartMax <= 0) return [0];
  const steps = Math.max(1, tickCount - 1);
  const step = niceStep(chartMax / steps);
  const top = Math.ceil(chartMax / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top; value += step) ticks.push(value);
  return ticks;
}

export function flowBarHeight(value: number, chartMax: number): number {
  if (value <= 0 || chartMax <= 0) return 0;
  return Math.max(4, Math.round((value / chartMax) * FLOW_CHART_PLOT_HEIGHT));
}

export function compactAxisLabel(amount: number, currency: string): string {
  return formatCompactMoney(amount, currency);
}

export function hasFlowChartActivity(chart: FlowChartModel): boolean {
  return chart.days.some((day) => day.income.amount > 0 || day.expense.amount > 0);
}

export function presentFlowChart(values: readonly FlowDayValue[]): FlowChartModel {
  const peak = Math.max(...values.flatMap((value) => [value.income, value.expense]), 0);
  const max = niceChartMax(peak);
  const ticks = chartYAxisTicks(max);

  return {
    days: values.map((value) => ({
      label: value.label,
      active: value.active,
      income: {
        amount: value.income,
        barHeight: flowBarHeight(value.income, max),
      },
      expense: {
        amount: value.expense,
        barHeight: flowBarHeight(value.expense, max),
      },
    })),
    scale: { max, ticks },
  };
}
