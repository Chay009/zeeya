import { Pressable, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { useThemeColors } from "@/components/ui/theme";

import type { MonthlyValue } from "../insights-data";

const PLOT_HEIGHT = 150;
const LABEL_WIDTH = 34;

function currencyMark(currency: string): string {
  if (currency === "INR") return "₹";
  if (currency === "USD") return "$";
  if (currency === "EUR") return "€";
  if (currency === "GBP") return "£";
  return `${currency} `;
}

function compactMoney(value: number, currency: string): string {
  const mark = currencyMark(currency);
  if (value >= 1000) {
    const decimals = value >= 10000 ? 0 : 1;
    return `${mark}${(value / 1000).toFixed(decimals).replace(/\.0$/, "")}k`;
  }
  return `${mark}${Math.round(value).toLocaleString("en-IN")}`;
}

function axisMaxFor(maxValue: number): number {
  if (maxValue <= 0) return 0;

  const rawStep = maxValue / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const fourSteps = step * magnitude * 4;
  return fourSteps >= maxValue ? fourSteps : step * magnitude * 5;
}

export function ZeeyaMonthlyBarChart({
  data,
  currency,
  isLoading = false,
  onSelect,
  activeBarColor: activeBarColorProp,
  dark = false,
}: {
  data: MonthlyValue[];
  currency: string;
  isLoading?: boolean;
  onSelect?: (point: MonthlyValue) => void;
  activeBarColor?: string;
  dark?: boolean;
}) {
  const colors = useThemeColors();
  const activeBarColor = activeBarColorProp ?? colors.chartLine;
  const maxValue = Math.max(...data.map((point) => point.value), 0);
  const axisMax = axisMaxFor(maxValue);
  const labelColor = dark ? "rgba(255,255,255,0.45)" : colors.muted;
  const gridColor = dark ? "rgba(255,255,255,0.08)" : colors.divider;
  const baselineColor = dark ? "rgba(255,255,255,0.12)" : colors.border;
  const inactiveBarColor = dark ? "rgba(255,255,255,0.14)" : "#e4e4e7";

  if (axisMax === 0) {
    return null;
  }

  const ticks = [axisMax, axisMax * 0.75, axisMax * 0.5, axisMax * 0.25, 0];

  return (
    <View style={{ height: 210 }}>
      <View style={{ flexDirection: "row", height: PLOT_HEIGHT }}>
        <View
          style={{
            width: LABEL_WIDTH,
            height: PLOT_HEIGHT,
            justifyContent: "space-between",
            paddingBottom: 2,
          }}
        >
          {ticks.map((tick) => (
            <Text key={tick} style={{ fontSize: 10, color: labelColor }}>
              {compactMoney(tick, currency)}
            </Text>
          ))}
        </View>

        <View style={{ flex: 1, marginLeft: 8, position: "relative" }}>
          {ticks.slice(0, -1).map((tick, index) => (
            <View
              key={`grid-${index}-${tick}`}
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: (PLOT_HEIGHT / 4) * index,
                borderTopWidth: 1,
                borderTopColor: gridColor,
              }}
            />
          ))}
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              borderBottomWidth: 1,
              borderBottomColor: baselineColor,
            }}
          />

          <View
            style={{
              height: PLOT_HEIGHT,
              flexDirection: "row",
              alignItems: "flex-end",
              justifyContent: "space-around",
              paddingHorizontal: 4,
            }}
          >
            {data.map((point) => {
              const barHeight = point.value > 0 ? Math.max(4, (point.value / axisMax) * 134) : 0;
              const barColor = point.isCurrent ? activeBarColor : inactiveBarColor;

              const bar = (
                <View
                  accessibilityLabel={`${point.label}: ${compactMoney(point.value, currency)}`}
                  style={{
                    width: 30,
                    height: barHeight,
                    borderTopLeftRadius: 7,
                    borderTopRightRadius: 7,
                    backgroundColor: barColor,
                  }}
                />
              );

              return (
                <View
                  key={`${point.monthStart}-${point.label}`}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "flex-end",
                    height: PLOT_HEIGHT,
                  }}
                >
                  {onSelect ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Inspect ${point.label} monthly total`}
                      onPress={() => onSelect(point)}
                      style={{ justifyContent: "flex-end", alignItems: "center" }}
                    >
                      {bar}
                    </Pressable>
                  ) : (
                    bar
                  )}
                </View>
              );
            })}
          </View>
        </View>
      </View>

      <View style={{ flexDirection: "row", marginLeft: LABEL_WIDTH + 8, paddingHorizontal: 4 }}>
        {data.map((point) => (
          <View
            key={`${point.monthStart}-${point.label}-label`}
            style={{ flex: 1, alignItems: "center" }}
          >
            <Text style={{ marginTop: 10, fontSize: 11, color: labelColor }}>{point.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
