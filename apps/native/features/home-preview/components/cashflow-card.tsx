import { Ionicons } from "@expo/vector-icons";
import { CalendarList, type DateData } from "react-native-calendars";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PanResponder, Pressable, Text, View } from "react-native";

import type { HomePreviewData } from "../data";
import { hp } from "../theme";

const CHART_LABELS = ["Income vs Expense", "Calendar", "By category"];
const CALENDAR_DAY_HEIGHT = 36;
const CALENDAR_GRID_HEIGHT = CALENDAR_DAY_HEIGHT * 6;

type CalendarMonth = HomePreviewData["cashflow"]["calendarMonths"][number];

type CalendarDayProps = {
  accessibilityLabel?: string;
  date?: DateData;
  onLongPress?: (date?: DateData) => void;
  onPress?: (date?: DateData) => void;
  state?: string;
  testID?: string;
};

function CashflowValue({ value, lineCount }: { value: string; lineCount: number }) {
  const lines = value.split(" + ").map((part, index) => (index === 0 ? part : `+ ${part}`));
  const lineHeight = 30;

  return (
    <View
      style={{
        minHeight: lineCount * lineHeight,
        justifyContent: "flex-end",
      }}
    >
      {lines.map((line, index) => (
        <Text
          key={`${index}-${line}`}
          style={{
            fontSize: 25,
            fontWeight: "800",
            letterSpacing: -1.5,
            lineHeight,
            color: hp.ink,
          }}
        >
          {line}
        </Text>
      ))}
    </View>
  );
}

function compactCalendarNet(value: string): string {
  const sign = value.startsWith("+") || value.startsWith("−") ? value.slice(0, 1) : "";
  const unsigned = sign ? value.slice(1).trim() : value.trim();
  const amountMatch = unsigned.match(/([\d,]+(?:\.\d+)?)$/);

  if (!amountMatch || amountMatch.index === undefined) return value;

  const amount = Number.parseFloat(amountMatch[1].replace(/,/g, ""));
  if (!Number.isFinite(amount)) return value;

  const amountLabel =
    amount >= 1_000_000
      ? `${(amount / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
      : amount >= 1_000
        ? `${(amount / 1_000).toFixed(1).replace(/\.0$/, "")}k`
        : amount.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const prefix = unsigned.slice(0, amountMatch.index).trim();
  const currencyLabel = /^[A-Za-z]+$/.test(prefix) ? `${prefix} ` : prefix;

  return `${sign}${currencyLabel}${amountLabel}`;
}

function HomeCalendarDay({
  accessibilityLabel,
  date,
  month,
  onLongPress,
  onPress,
  state,
  testID,
}: CalendarDayProps & { month?: CalendarMonth }) {
  const isDisabled = state === "disabled";
  const net = date && month && !isDisabled ? month.nets[date.day] : undefined;
  const displayNet = net ? compactCalendarNet(net) : undefined;
  const isToday = state === "today" || month?.today === date?.day;

  return (
    <Pressable
      accessibilityLabel={
        net ? `${accessibilityLabel ?? date?.day ?? ""}, ${net}` : accessibilityLabel
      }
      accessibilityRole="button"
      onLongPress={() => onLongPress?.(date)}
      onPress={() => onPress?.(date)}
      disabled={isDisabled}
      testID={testID}
      style={{
        width: "100%",
        height: CALENDAR_DAY_HEIGHT,
        alignItems: "center",
        justifyContent: "center",
        gap: 1,
        borderRadius: 9,
        backgroundColor: isToday ? "rgba(47,157,112,0.12)" : "transparent",
      }}
    >
      <Text
        style={{
          fontSize: 10,
          fontWeight: "700",
          color: isDisabled ? "#b6c3bb" : isToday ? hp.emeraldDeep : net ? hp.inkSoft : "#7d8980",
        }}
      >
        {date?.day}
      </Text>
      {net && (
        <View
          style={{
            maxWidth: "100%",
            borderRadius: 999,
            paddingHorizontal: 2,
            paddingVertical: 1,
            backgroundColor: isToday
              ? "rgba(255,255,255,0.85)"
              : net.startsWith("+")
                ? "#c6ebd3"
                : "#fbe2da",
          }}
        >
          <Text
            adjustsFontSizeToFit
            ellipsizeMode="clip"
            numberOfLines={1}
            style={{
              fontSize: 7,
              fontWeight: "800",
              flexShrink: 1,
              lineHeight: 8,
              minWidth: 0,
              textAlign: "center",
              color: isToday ? "#c04a3e" : net.startsWith("+") ? "#1c7a55" : "#c04a3e",
            }}
          >
            {displayNet}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function CashflowCard({ data }: { data: HomePreviewData["cashflow"] }) {
  const [chartIndex, setChartIndex] = useState(0);
  const [calendarIndex, setCalendarIndex] = useState(0);
  const [calendarWidth, setCalendarWidth] = useState(0);

  const prevChart = useCallback(
    () => setChartIndex((i) => (i + CHART_LABELS.length - 1) % CHART_LABELS.length),
    [],
  );
  const nextChart = useCallback(() => setChartIndex((i) => (i + 1) % CHART_LABELS.length), []);
  const chartPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx <= -40) nextChart();
          if (gestureState.dx >= 40) prevChart();
        },
      }),
    [nextChart, prevChart],
  );

  const month = data.calendarMonths[calendarIndex] ?? data.calendarMonths[0]!;
  const metricLineCount = Math.max(
    data.income.split(" + ").length,
    data.expense.split(" + ").length,
    1,
  );
  const calendarMonthByKey = useMemo(
    () => new Map(data.calendarMonths.map((candidate) => [candidate.key, candidate])),
    [data.calendarMonths],
  );
  useEffect(() => {
    setCalendarIndex((index) => Math.min(index, Math.max(0, data.calendarMonths.length - 1)));
  }, [data.calendarMonths.length]);
  const calendarDay = useCallback(
    (dayProps: CalendarDayProps) => {
      const dayMonth = dayProps.date
        ? calendarMonthByKey.get(dayProps.date.dateString.slice(0, 7))
        : undefined;
      return <HomeCalendarDay {...dayProps} month={dayMonth} />;
    },
    [calendarMonthByKey],
  );
  const onVisibleMonthsChange = useCallback(
    (dates: DateData[]) => {
      const date = dates[0];
      if (!date) return;
      const nextIndex = data.calendarMonths.findIndex(
        (candidate) => candidate.key === date.dateString.slice(0, 7),
      );
      if (nextIndex !== -1) setCalendarIndex(nextIndex);
    },
    [data.calendarMonths],
  );

  return (
    <View
      style={{
        marginTop: 12,
        borderRadius: 27,
        backgroundColor: hp.cardAlt,
        padding: 20,
        overflow: "hidden",
      }}
    >
      <View
        style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}
      >
        <View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1.8, color: hp.muted }}>
              CASH FLOW
            </Text>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: hp.emerald }} />
          </View>
          <Text style={{ marginTop: 4, fontSize: 13, color: "#7b8f83" }}>{data.subtitle}</Text>
        </View>
        <View
          style={{
            borderRadius: 999,
            backgroundColor: hp.emerald,
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: "700", color: "white" }}>Week</Text>
        </View>
      </View>

      <View
        style={{
          marginTop: 20,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Pressable
          onPress={prevChart}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: "rgba(255,255,255,0.6)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="chevron-back" size={16} color={hp.inkSoft} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ fontSize: 12, fontWeight: "800", color: "#234f3a" }}>
            {CHART_LABELS[chartIndex]}
          </Text>
          <View style={{ marginTop: 6, flexDirection: "row", gap: 6 }}>
            {CHART_LABELS.map((_, i) => (
              <View
                key={i}
                style={{
                  height: 6,
                  width: i === chartIndex ? 16 : 6,
                  borderRadius: 3,
                  backgroundColor: i === chartIndex ? hp.emerald : "#cfe0d4",
                }}
              />
            ))}
          </View>
        </View>
        <Pressable
          onPress={nextChart}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: "rgba(255,255,255,0.6)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="chevron-forward" size={16} color={hp.inkSoft} />
        </Pressable>
      </View>

      <View {...(chartIndex === 1 ? {} : chartPanResponder.panHandlers)} style={{ marginTop: 16 }}>
        {chartIndex === 0 && (
          <View>
            <View style={{ flexDirection: "row", gap: 16 }}>
              <View style={{ flex: 1 }}>
                <CashflowValue value={data.income} lineCount={metricLineCount} />
                <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View
                    style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: hp.emerald }}
                  />
                  <Text style={{ fontSize: 12, color: "#71877b" }}>Income</Text>
                </View>
              </View>
              <View
                style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: "#cfe5d5", paddingLeft: 16 }}
              >
                <CashflowValue value={data.expense} lineCount={metricLineCount} />
                <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View
                    style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: hp.coralBar }}
                  />
                  <Text style={{ fontSize: 12, color: "#71877b" }}>Expense</Text>
                </View>
              </View>
            </View>
            <View
              style={{
                marginTop: 20,
                flexDirection: "row",
                height: 126,
                borderBottomWidth: 1,
                borderBottomColor: "#cfe5d5",
                paddingBottom: 8,
                gap: 4,
              }}
            >
              {data.flowBars.map(([inc, exp], i) => (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "flex-end",
                    justifyContent: "center",
                    gap: 4,
                  }}
                >
                  <View
                    style={{ width: 10, height: inc, borderRadius: 5, backgroundColor: hp.emerald }}
                  />
                  <View
                    style={{
                      width: 10,
                      height: exp,
                      borderRadius: 5,
                      backgroundColor: hp.coralBar,
                    }}
                  />
                </View>
              ))}
            </View>
            <View
              style={{
                marginTop: 8,
                flexDirection: "row",
                justifyContent: "space-between",
                paddingHorizontal: 4,
              }}
            >
              {data.flowDays.map((day) => (
                <View key={day.label} style={{ alignItems: "center", gap: 4 }}>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "700",
                      color: day.active ? hp.emeraldDeep : "#8ba095",
                    }}
                  >
                    {day.label}
                  </Text>
                  {day.active && (
                    <View
                      style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: hp.emerald }}
                    />
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {chartIndex === 1 && (
          <View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <View>
                <Text
                  style={{ fontSize: 19, fontWeight: "800", letterSpacing: -0.95, color: hp.ink }}
                >
                  {month.spent}
                </Text>
                <Text style={{ marginTop: 2, fontSize: 12, color: "#71877b" }}>
                  spent · income {month.income}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Pressable
                  accessibilityLabel="Show older month"
                  disabled={calendarIndex >= data.calendarMonths.length - 1}
                  onPress={() =>
                    setCalendarIndex((j) => Math.min(j + 1, data.calendarMonths.length - 1))
                  }
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: "rgba(255,255,255,0.6)",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: calendarIndex >= data.calendarMonths.length - 1 ? 0.35 : 1,
                  }}
                >
                  <Ionicons name="chevron-back" size={14} color={hp.inkSoft} />
                </Pressable>
                <View
                  style={{
                    borderRadius: 999,
                    backgroundColor: "rgba(255,255,255,0.6)",
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: "700", color: hp.inkSoft }}>
                    {month.label}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="Show newer month"
                  disabled={calendarIndex === 0}
                  onPress={() => setCalendarIndex((j) => Math.max(j - 1, 0))}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: "rgba(255,255,255,0.6)",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: calendarIndex === 0 ? 0.35 : 1,
                  }}
                >
                  <Ionicons name="chevron-forward" size={14} color={hp.inkSoft} />
                </Pressable>
              </View>
            </View>

            <View style={{ marginTop: 16, flexDirection: "row" }}>
              {["M", "T", "W", "T", "F", "S", "S"].map((d, index) => (
                <View key={`${d}-${index}`} style={{ flex: 1, alignItems: "center" }}>
                  <Text
                    style={{ fontSize: 9, fontWeight: "700", letterSpacing: 0.8, color: "#8ba095" }}
                  >
                    {d}
                  </Text>
                </View>
              ))}
            </View>

            <View
              onLayout={(event) => setCalendarWidth(Math.round(event.nativeEvent.layout.width))}
              style={{ marginTop: 8, overflow: "hidden" }}
            >
              {calendarWidth > 0 && (
                <CalendarList
                  current={`${month.key}-01`}
                  calendarHeight={CALENDAR_GRID_HEIGHT}
                  calendarWidth={calendarWidth}
                  dayComponent={calendarDay}
                  disableMonthChange
                  firstDay={1}
                  futureScrollRange={0}
                  headerStyle={{ height: 0, overflow: "hidden" }}
                  hideArrows
                  hideDayNames
                  horizontal
                  onVisibleMonthsChange={onVisibleMonthsChange}
                  pagingEnabled
                  pastScrollRange={Math.max(0, data.calendarMonths.length - 1)}
                  renderHeader={() => null}
                  showSixWeeks
                  showScrollIndicator={false}
                  style={{ backgroundColor: "transparent" }}
                  theme={{
                    calendarBackground: "transparent",
                    weekVerticalMargin: 0,
                  }}
                />
              )}
            </View>

            <View style={{ marginTop: 12, flexDirection: "row", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View
                  style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: hp.coralBar }}
                />
                <Text style={{ fontSize: 10, fontWeight: "700", color: "#71877b" }}>Expense</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View
                  style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: hp.emerald }}
                />
                <Text style={{ fontSize: 10, fontWeight: "700", color: "#71877b" }}>Income</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: "rgba(47,157,112,0.18)",
                    borderWidth: 1,
                    borderColor: "rgba(47,157,112,0.45)",
                  }}
                />
                <Text style={{ fontSize: 10, fontWeight: "700", color: "#71877b" }}>Today</Text>
              </View>
            </View>
          </View>
        )}

        {chartIndex === 2 && (
          <View>
            <Text style={{ fontSize: 12, color: "#71877b" }}>Where the money went this week</Text>
            <View style={{ marginTop: 16, gap: 14 }}>
              {data.categories.map((cat) => (
                <View key={cat.label}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View
                        style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cat.color }}
                      />
                      <Text style={{ fontSize: 12, fontWeight: "700", color: hp.inkSoft }}>
                        {cat.label}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: hp.inkSoft }}>
                      {cat.amount}
                    </Text>
                  </View>
                  <View
                    style={{
                      marginTop: 6,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: hp.track,
                      overflow: "hidden",
                    }}
                  >
                    <View
                      style={{
                        height: "100%",
                        width: `${cat.pct}%`,
                        borderRadius: 4,
                        backgroundColor: cat.color,
                      }}
                    />
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
