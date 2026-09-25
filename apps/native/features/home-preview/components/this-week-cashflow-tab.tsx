import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { MoneyText } from "@/components/native-ui/money-text";

import type { HomePreviewData } from "../data";
import {
  compactAxisLabel,
  FLOW_CHART_PLOT_HEIGHT,
  FLOW_CHART_Y_AXIS_WIDTH,
  hasFlowChartActivity,
} from "../data/flow-chart-scale";
import { AnimatedFlowBar } from "./animated-flow-bar";
import { EmptyNote } from "./empty-note";

function CashflowValue({ value, lineCount }: { value: string; lineCount: number }) {
  const lines = value.split(" + ").map((part, index) => (index === 0 ? part : `+ ${part}`));
  const lineHeight = 30;

  return (
    <View className="justify-end" style={{ minHeight: lineCount * lineHeight }}>
      {lines.map((line, index) => (
        <MoneyText
          key={`${index}-${line}`}
          weight="semibold"
          className="text-[25px] tracking-tight text-ink"
          style={{ lineHeight }}
        >
          {line}
        </MoneyText>
      ))}
    </View>
  );
}

function FlowBarColumn({
  incomeHeight,
  expenseHeight,
  incomeAmount,
  expenseAmount,
  currency,
}: {
  incomeHeight: number;
  expenseHeight: number;
  incomeAmount: number;
  expenseAmount: number;
  currency: string;
}) {
  const showIncomeLabel = incomeAmount > 0 && incomeHeight >= 18;
  const showExpenseLabel = expenseAmount > 0 && expenseHeight >= 18;

  return (
    <View className="flex-1 items-center">
      <View
        className="w-full flex-row items-end justify-center gap-1"
        style={{ height: FLOW_CHART_PLOT_HEIGHT }}
      >
        <View className="items-center justify-end" style={{ height: FLOW_CHART_PLOT_HEIGHT }}>
          {showIncomeLabel ? (
            <MoneyText
              numberOfLines={1}
              weight="semibold"
              className="mb-0.5 text-[8px] font-extrabold text-emerald-deep"
            >
              {compactAxisLabel(incomeAmount, currency)}
            </MoneyText>
          ) : null}
          <AnimatedFlowBar height={incomeHeight} tone="income" />
        </View>
        <View className="items-center justify-end" style={{ height: FLOW_CHART_PLOT_HEIGHT }}>
          {showExpenseLabel ? (
            <MoneyText
              numberOfLines={1}
              weight="semibold"
              className="mb-0.5 text-[8px] font-extrabold text-coral"
            >
              {compactAxisLabel(expenseAmount, currency)}
            </MoneyText>
          ) : null}
          <AnimatedFlowBar height={expenseHeight} tone="expense" />
        </View>
      </View>
    </View>
  );
}

function YAxisLabels({
  ticks,
  currency,
  align,
}: {
  ticks: readonly number[];
  currency: string;
  align: "left" | "right";
}) {
  const ordered = [...ticks].reverse();

  return (
    <View
      style={{ width: FLOW_CHART_Y_AXIS_WIDTH, height: FLOW_CHART_PLOT_HEIGHT }}
      className="justify-between"
    >
      {ordered.map((tick) => (
        <MoneyText
          key={tick}
          numberOfLines={1}
          weight="medium"
          className={`text-[9px] font-bold text-muted-soft ${align === "left" ? "text-right pr-1" : "text-left pl-1"}`}
        >
          {compactAxisLabel(tick, currency)}
        </MoneyText>
      ))}
    </View>
  );
}

export function ThisWeekCashflowTab({ data }: { data: HomePreviewData["cashflow"] }) {
  const { flowChart } = data;
  const metricLineCount = Math.max(data.income.split(" + ").length, data.expense.split(" + ").length, 1);
  const yTicks = flowChart.scale.ticks.length > 0 ? flowChart.scale.ticks : [0, flowChart.scale.max];
  const scaleMax = yTicks[yTicks.length - 1] ?? flowChart.scale.max;

  if (!hasFlowChartActivity(flowChart)) {
    return (
      <EmptyNote
        icon="chart"
        title="No cashflow this week"
        body="Green and red bars for income and expense appear here after money moves."
      />
    );
  }

  return (
    <View>
      <View className="flex-row">
        <YAxisLabels ticks={yTicks} currency={data.selectedCurrency} align="left" />

        <View className="relative flex-1" style={{ height: FLOW_CHART_PLOT_HEIGHT }}>
          {yTicks.map((tick) => {
            const bottom = scaleMax <= 0 ? 0 : (tick / scaleMax) * FLOW_CHART_PLOT_HEIGHT;
            return (
              <View
                key={`grid-${tick}`}
                pointerEvents="none"
                className="absolute left-0 right-0 border-t border-border-soft"
                style={{ bottom }}
              />
            );
          })}

          <View className="absolute inset-0 flex-row gap-1 border-b border-border-sage pb-2">
            {flowChart.days.map((day) => (
              <FlowBarColumn
                key={day.label}
                incomeHeight={day.income.barHeight}
                expenseHeight={day.expense.barHeight}
                incomeAmount={day.income.amount}
                expenseAmount={day.expense.amount}
                currency={data.selectedCurrency}
              />
            ))}
          </View>
        </View>

        <YAxisLabels ticks={yTicks} currency={data.selectedCurrency} align="right" />
      </View>

      <View className="mt-2 flex-row justify-between px-[38px]">
        {flowChart.days.map((day) => (
          <View key={day.label} className="flex-1 items-center gap-1">
            <Text className={`text-label font-bold ${day.active ? "text-emerald-deep" : "text-sage-muted"}`}>
              {day.label}
            </Text>
            {day.active ? <View className="h-1 w-1 rounded-full bg-emerald" /> : null}
          </View>
        ))}
      </View>

      <View className="mt-4 flex-row gap-4">
        <View className="flex-1">
          <Text className="text-caption text-sage-soft">Income</Text>
          <View className="mt-1">
            <CashflowValue value={data.income} lineCount={metricLineCount} />
          </View>
        </View>
        <View className="flex-1 border-l border-border-sage pl-4">
          <Text className="text-caption text-sage-soft">Expense</Text>
          <View className="mt-1">
            <CashflowValue value={data.expense} lineCount={metricLineCount} />
          </View>
        </View>
      </View>
    </View>
  );
}
