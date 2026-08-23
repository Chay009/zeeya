import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { calendarMonths, categories, flowBars, flowDays } from "../data";
import { hp } from "../theme";

const CHART_LABELS = ["Income vs Expense", "Calendar", "By category"];

export function CashflowCard() {
  const [chartIndex, setChartIndex] = useState(0);
  const [calendarIndex, setCalendarIndex] = useState(2);

  const prevChart = () => setChartIndex((i) => (i + CHART_LABELS.length - 1) % CHART_LABELS.length);
  const nextChart = () => setChartIndex((i) => (i + 1) % CHART_LABELS.length);

  const month = calendarMonths[calendarIndex];

  return (
    <View
      style={{
        marginTop: 12,
        borderRadius: 27,
        backgroundColor: hp.cardAlt,
        padding: 20,
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
          <Text style={{ marginTop: 4, fontSize: 13, color: "#7b8f83" }}>
            This week compared to last
          </Text>
        </View>
        <View
          style={{
            flexDirection: "row",
            borderRadius: 999,
            backgroundColor: "#d7eddd",
            padding: 4,
          }}
        >
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
          <Pressable style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ fontSize: 10, fontWeight: "700", color: "#70867a" }}>Month</Text>
          </Pressable>
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

      <View style={{ marginTop: 16 }}>
        {chartIndex === 0 && (
          <View>
            <View style={{ flexDirection: "row", gap: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 25, fontWeight: "800", color: hp.ink }}>₹5,10,000</Text>
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
                <Text style={{ fontSize: 25, fontWeight: "800", color: hp.ink }}>₹1,35,200</Text>
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
              {flowBars.map(([inc, exp], i) => (
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
              {flowDays.map((day) => (
                <View key={day} style={{ alignItems: "center", gap: 4 }}>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "700",
                      color: day === "Wed" ? hp.emeraldDeep : "#8ba095",
                    }}
                  >
                    {day}
                  </Text>
                  {day === "Wed" && (
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
                <Text style={{ fontSize: 19, fontWeight: "800", color: hp.ink }}>
                  {month.spent}
                </Text>
                <Text style={{ marginTop: 2, fontSize: 12, color: "#71877b" }}>
                  spent · income {month.income}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Pressable
                  onPress={() =>
                    setCalendarIndex((j) => (j + calendarMonths.length - 1) % calendarMonths.length)
                  }
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: "rgba(255,255,255,0.6)",
                    alignItems: "center",
                    justifyContent: "center",
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
                  onPress={() => setCalendarIndex((j) => (j + 1) % calendarMonths.length)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: "rgba(255,255,255,0.6)",
                    alignItems: "center",
                    justifyContent: "center",
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

            <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap" }}>
              {(() => {
                const cells: React.ReactNode[] = [];
                for (let i = 0; i < month.offset; i++)
                  cells.push(<View key={`b-${i}`} style={{ width: "14.28%", height: 44 }} />);
                for (let day = 1; day <= month.days; day++) {
                  const net = month.nets[day];
                  const isToday = month.today === day;
                  cells.push(
                    <View
                      key={day}
                      style={{
                        width: "14.28%",
                        height: 44,
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 2,
                        borderRadius: 9,
                        backgroundColor: isToday ? "rgba(47,157,112,0.12)" : "transparent",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "700",
                          color: isToday ? hp.emeraldDeep : net ? hp.inkSoft : "#7d8980",
                        }}
                      >
                        {day}
                      </Text>
                      {net && (
                        <View
                          style={{
                            borderRadius: 999,
                            paddingHorizontal: 6,
                            paddingVertical: 1,
                            backgroundColor: isToday
                              ? "rgba(255,255,255,0.85)"
                              : net.startsWith("+")
                                ? "#c6ebd3"
                                : "#fbe2da",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 8,
                              fontWeight: "800",
                              color: isToday
                                ? "#c04a3e"
                                : net.startsWith("+")
                                  ? "#1c7a55"
                                  : "#c04a3e",
                            }}
                          >
                            {net}
                          </Text>
                        </View>
                      )}
                    </View>,
                  );
                }
                const trailing = (7 - ((month.offset + month.days) % 7)) % 7;
                for (let i = 0; i < trailing; i++)
                  cells.push(<View key={`t-${i}`} style={{ width: "14.28%", height: 44 }} />);
                return cells;
              })()}
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
              {categories.map((cat) => (
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
                        width: cat.pct as never,
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
