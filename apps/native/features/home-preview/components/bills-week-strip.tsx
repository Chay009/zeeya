import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { useThemeColors } from "@/components/ui/theme";

import { merchantVisual } from "../data";
import { BrandLogo } from "./brand-logo";

// The next seven days as a strip of round day cells (the reference's Bills
// screen): today filled ink, and under each day the logo of what falls due
// on it — or a faint dashed ring when nothing does. One glance answers "is
// anything due this week, and when?".

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

export interface StripItem {
  key: string;
  name: string;
  /** Local ms on the due day. */
  at: number;
}

function startOfDay(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function BillsWeekStrip({ items, today }: { items: readonly StripItem[]; today: number }) {
  const colors = useThemeColors();
  const start = startOfDay(today);
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start + index * DAY_MS + 2 * 60 * 60 * 1000); // DST-safe
    const dayStart = startOfDay(day.getTime());
    return {
      key: dayStart,
      weekday: WEEKDAY[day.getDay()]!,
      date: day.getDate(),
      due: items.find((item) => startOfDay(item.at) === dayStart) ?? null,
    };
  });
  const dueCount = items.filter((item) => {
    const at = startOfDay(item.at);
    return at >= start && at < start + 7 * DAY_MS;
  }).length;

  return (
    <View>
      <Text className="text-caption text-muted">
        {dueCount === 0 ? (
          "Nothing due in the next 7 days"
        ) : (
          <>
            You have{" "}
            <Text className="text-caption font-semibold text-ink">
              {dueCount} {dueCount === 1 ? "bill" : "bills"}
            </Text>{" "}
            due within the next 7 days
          </>
        )}
      </Text>
      <View className="mt-3 rounded-[20px] px-1.5 py-3" style={{ backgroundColor: colors.fill }}>
        <View className="flex-row">
          {days.map((day, index) => (
            <Text
              key={day.key}
              className={`flex-1 text-center text-caption ${index === 0 ? "font-semibold text-ink" : "text-muted"}`}
            >
              {day.weekday}
            </Text>
          ))}
        </View>
        <View className="mt-2 flex-row">
          {days.map((day, index) => {
            const isToday = index === 0;
            const visual = day.due ? merchantVisual(day.due.name, "") : null;
            return (
              <View
                key={day.key}
                accessible
                accessibilityLabel={`${day.date}${day.due ? `, ${day.due.name} due` : ""}`}
                className="flex-1 items-center"
              >
                <View
                  className="items-center rounded-full px-1 pb-1.5 pt-2"
                  style={{
                    width: 40,
                    backgroundColor: isToday ? colors.ink : colors.card,
                  }}
                >
                  <Text
                    className="text-body font-medium"
                    style={{ color: isToday ? colors.onInk : colors.ink }}
                  >
                    {day.date}
                  </Text>
                  <View className="mt-1 h-[18px] w-[18px] items-center justify-center">
                    {day.due && visual ? (
                      <BrandLogo
                        letter={day.due.name.charAt(0).toUpperCase() || "?"}
                        tile={visual.tile}
                        ink={visual.ink}
                        img={visual.img}
                        size={18}
                        radius={9}
                        iconRatio={0.62}
                      />
                    ) : (
                      <View
                        className="h-4 w-4 rounded-full"
                        style={{
                          borderWidth: 1,
                          borderStyle: "dashed",
                          borderColor: isToday ? colors.onInk : colors.faint,
                        }}
                      />
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}
