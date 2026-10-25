import { Calendar, type DateData } from "react-native-calendars";
import { memo, useCallback, useMemo, useState, type ComponentProps } from "react";
import { Pressable, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";
import { parseDecimalAmount } from "@zeeya/parser/normalize";

import { daysInMonth, monthKey, startOfMonth } from "@/lib/calendar";
import { dateFormat, numberFormat } from "@/lib/intl-format";

import type { HomePreviewData } from "../data";
import { DayDetailSheet } from "./day-detail-sheet";
import { useThemeColors } from "@/components/ui/theme";

const CALENDAR_DAY_HEIGHT = 48;

// react-native-calendars' own Theme type declares "stylesheet" as a nested
// { calendar: { main } } path, but calendar/style.js actually reads a
// literal dotted-string key at runtime — the declared type is stale
// relative to the implementation. This extends the real theme prop type
// with the key as it's actually read, instead of fighting or suppressing
// the mismatch at the call site.
type CalendarTheme = ComponentProps<typeof Calendar>["theme"] & {
  "stylesheet.calendar.main"?: { week?: Record<string, unknown> };
};

const MONTH_CALENDAR_THEME = {
  calendarBackground: "transparent",
  weekVerticalMargin: 0,
  "stylesheet.calendar.main": {
    week: {
      flexDirection: "row",
      justifyContent: "space-around",
      marginTop: 0,
      marginBottom: 0,
      minHeight: CALENDAR_DAY_HEIGHT,
    },
  },
} as CalendarTheme;

type CalendarMonth = HomePreviewData["cashflow"]["calendarMonths"][number];

type CalendarDayProps = {
  accessibilityLabel?: string;
  date?: DateData;
  onLongPress?: (date?: DateData) => void;
  onPress?: (date?: DateData) => void;
  state?: string;
  testID?: string;
};

function compactCalendarNet(value: string): string {
  const sign = value.startsWith("+")
    ? "+"
    : value.startsWith("−") || value.startsWith("-")
      ? "−"
      : value.startsWith("±")
        ? "±"
        : "";
  const amount = parseDecimalAmount(value.replace(/[^\d,.-]/g, ""));
  if (amount === null) return sign || value;
  const amountLabel = numberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  })
    .format(amount)
    .replace(/[\u00a0\u202f]/g, "");
  return `${sign}${amountLabel}`;
}

// The real current month with a correct day grid but no transaction data —
// used only when calendarMonths is genuinely empty (no history yet), so the
// grid still renders real dates instead of a fabricated "—" placeholder.
function currentMonthWithNoData(): CalendarMonth {
  const now = new Date();
  const monthStart = new Date(startOfMonth(now));
  return {
    key: monthKey(now),
    label: dateFormat("en-IN", { month: "short", year: "numeric" }).format(now),
    spent: "",
    income: "",
    offset: (monthStart.getDay() + 6) % 7,
    days: daysInMonth(now),
    today: now.getDate(),
    nets: {},
  };
}

const HomeCalendarDay = memo(function HomeCalendarDay({
  accessibilityLabel,
  date,
  month,
  onLongPress,
  onPress,
  state,
  testID,
}: CalendarDayProps & { month?: CalendarMonth }) {
  const colors = useThemeColors();
  const isDisabled = state === "disabled";
  const net =
    date && month && !isDisabled
      ? (month.nets[date.day] ?? month.nets[Number(date.day)])
      : undefined;
  const displayNet = net ? compactCalendarNet(net) : undefined;
  const isToday = state === "today" || month?.today === date?.day;
  const income = Boolean(net?.startsWith("+"));

  const hasNet = Boolean(net);

  return (
    <Pressable
      accessibilityLabel={
        net
          ? `${accessibilityLabel ?? date?.day ?? ""}, ${net}, view transactions`
          : accessibilityLabel
      }
      accessibilityRole={onPress ? "button" : undefined}
      onLongPress={onLongPress ? () => onLongPress(date) : undefined}
      onPress={onPress ? () => onPress(date) : undefined}
      disabled={isDisabled || !onPress}
      testID={testID}
      className="w-full items-center justify-start pt-0.5"
      style={{ height: CALENDAR_DAY_HEIGHT }}
    >
      <View
        className="h-[26px] w-[26px] items-center justify-center rounded-full"
        style={{
          backgroundColor: isToday
            ? colors.accent
            : hasNet
              ? income
                ? "rgba(18,161,80,0.14)"
                : "rgba(229,72,77,0.12)"
              : "transparent",
        }}
      >
        <Text
          className={`text-subtitle font-semibold ${
            isDisabled
              ? "text-faint"
              : isToday
                ? "text-on-accent"
                : hasNet
                  ? "text-ink"
                  : "text-faint"
          }`}
        >
          {date?.day}
        </Text>
      </View>
      {displayNet ? (
        <Text
          numberOfLines={1}
          className={`mt-1 text-label font-semibold ${income ? "text-positive" : "text-muted"}`}
        >
          {displayNet}
        </Text>
      ) : null}
    </Pressable>
  );
});

export function ThisWeekCalendarTab({
  months: monthsProp,
  currency,
  isActive = true,
}: {
  months: CalendarMonth[];
  currency: string;
  isActive?: boolean;
}) {
  const colors = useThemeColors();
  // calendarMonths (db/queries-home.ts's monthKeys) is built oldest-first —
  // the newest/current month is the LAST element, not the first — so the
  // initial index must start there, not at 0 (which was showing whatever
  // the oldest fetched month happened to be, not the current one).
  // Memoized: a fresh fallback array every render invalidated the day-cell
  // memos below and re-rendered every calendar day.
  const months = useMemo(
    () => (monthsProp.length > 0 ? monthsProp : [currentMonthWithNoData()]),
    [monthsProp],
  );
  const [calendarIndex, setCalendarIndex] = useState(() => months.length - 1);
  const month = months[Math.min(calendarIndex, months.length - 1)];
  // The library only renders as many week-rows as the month actually needs
  // (5 or 6, see react-native-calendars' page()) — a hardcoded 6-row height
  // leaves a dead gap under 5-week months, so size the container to match.
  const gridWeeks = Math.max(1, Math.ceil((month.offset + month.days) / 7));
  const gridHeight = CALENDAR_DAY_HEIGHT * gridWeeks;
  const calendarMonthByKey = useMemo(
    () => new Map(months.map((candidate) => [candidate.key, candidate])),
    [months],
  );
  // A shrunk-but-still-in-range index just needs clamping (e.g. paging
  // changed how many months are loaded); a grown array most likely means
  // fresh data landed (currency switch, refresh) and the view should snap
  // back to the newest month rather than staying wherever the old, now-stale
  // index pointed. Adjusted while rendering (React's documented alternative
  // to an effect), so the stale month never paints.
  const [monthsLength, setMonthsLength] = useState(months.length);
  if (months.length !== monthsLength) {
    setMonthsLength(months.length);
    setCalendarIndex((index) =>
      months.length > monthsLength
        ? months.length - 1
        : Math.min(index, Math.max(0, months.length - 1)),
    );
  }

  // DateData.timestamp comes from react-native-calendars' own
  // `new XDate(dateString, true)` (the `true` means UTC) — trusting it
  // directly risks the exact local/UTC day-boundary mismatch already fixed
  // once in data.ts (see localDayKeyToEpoch's comment). date.year/month/day
  // are plain numbers with no timezone ambiguity, so the local-midnight
  // boundary is built from those instead.
  const [openDayStartMs, setOpenDayStartMs] = useState<number | null>(null);
  const openDay = useCallback((date?: DateData) => {
    if (!date) return;
    setOpenDayStartMs(new Date(date.year, date.month - 1, date.day).getTime());
  }, []);
  const onDaySheetOpenChange = useCallback((open: boolean) => {
    if (!open) setOpenDayStartMs(null);
  }, []);
  // Leaving the Calendar tab closes the day sheet for good (it must not
  // reopen on return) — adjusted while rendering, not in an effect.
  const [wasActive, setWasActive] = useState(isActive);
  if (isActive !== wasActive) {
    setWasActive(isActive);
    if (!isActive) setOpenDayStartMs(null);
  }
  const calendarDay = useCallback(
    (dayProps: CalendarDayProps) => {
      const dayKey = dayProps.date?.dateString.slice(0, 7);
      const dayMonth = dayKey ? calendarMonthByKey.get(dayKey) : undefined;
      const hasNet = Boolean(
        dayProps.date &&
        (dayMonth?.nets[dayProps.date.day] ?? dayMonth?.nets[Number(dayProps.date.day)]),
      );
      return (
        <HomeCalendarDay {...dayProps} month={dayMonth} onPress={hasNet ? openDay : undefined} />
      );
    },
    [calendarMonthByKey, openDay],
  );
  // Swipe is enabled (enableSwipeMonths), so the library's own gesture
  // recognizer can change its internal currentMonth independently of our
  // calendarIndex — this is the single place that reconciles the two.
  // A swipe landing on a month we have real data for just syncs the index;
  // a swipe past either end of the bounded `months` array (this isn't
  // infinite scroll — there's a fixed, fetched range) has nowhere valid to
  // land, so the key-remount below (the grid is keyed by month, which the
  // chevrons rely on too) snaps the library's internal state back to
  // whichever boundary month is closest, instead of leaving it drifted onto
  // a month with no data.
  const [swipeRevision, setSwipeRevision] = useState(0);
  const onMonthChange = useCallback(
    (date: DateData) => {
      const nextIndex = months.findIndex(
        (candidate) => candidate.key === date.dateString.slice(0, 7),
      );
      if (nextIndex !== -1) {
        setCalendarIndex(nextIndex);
        return;
      }
      const swipedForward = date.timestamp > new Date(`${month.key}-01`).getTime();
      setCalendarIndex(swipedForward ? months.length - 1 : 0);
      setSwipeRevision((revision) => revision + 1);
    },
    [months, month.key],
  );

  return (
    <View>
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-subtitle font-semibold text-ink">
            {month.spent}
          </Text>
          <Text numberOfLines={1} className="mt-0.5 text-caption text-muted">
            spent · income {month.income}
          </Text>
        </View>
        <View className="shrink-0 flex-row items-center gap-1">
          {months.length > 1 ? (
            <Pressable
              accessibilityLabel="Show older month"
              disabled={calendarIndex === 0}
              onPress={() => setCalendarIndex((j) => Math.max(j - 1, 0))}
              className={`h-8 w-8 items-center justify-center rounded-full bg-fill ${
                calendarIndex === 0 ? "opacity-35" : "opacity-100"
              }`}
            >
              <AppIcon name="chevron-left" size={18} color={colors.inkSoft} />
            </Pressable>
          ) : null}
          <View className="rounded-pill bg-fill px-3 py-1.5">
            <Text className="text-label font-semibold text-ink-soft">{month.label}</Text>
          </View>
          {months.length > 1 ? (
            <Pressable
              accessibilityLabel="Show newer month"
              disabled={calendarIndex >= months.length - 1}
              onPress={() => setCalendarIndex((j) => Math.min(j + 1, months.length - 1))}
              className={`h-8 w-8 items-center justify-center rounded-full bg-fill ${
                calendarIndex >= months.length - 1 ? "opacity-35" : "opacity-100"
              }`}
            >
              <AppIcon name="chevron-right" size={18} color={colors.inkSoft} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View className="mt-4 flex-row">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, index) => (
          <View key={`${d}-${index}`} className="flex-1 items-center">
            <Text className="text-label font-medium text-faint">{d}</Text>
          </View>
        ))}
      </View>

      <View className="mt-2" style={{ height: gridHeight }}>
        {/* Keyed by the shown month (and the swipe snap-back revision): the
            library reads `current` only when it mounts, so the chevrons —
            which change only calendarIndex — must remount it, or the header
            moves to the new month while the grid stays on the old one. */}
        <Calendar
          key={`calendar:${month.key}:${swipeRevision}`}
          current={`${month.key}-01`}
          dayComponent={calendarDay}
          disableMonthChange
          enableSwipeMonths
          firstDay={1}
          headerStyle={{ height: 0, overflow: "hidden" }}
          hideArrows
          hideDayNames
          hideExtraDays
          onMonthChange={onMonthChange}
          renderHeader={() => null}
          style={{ height: gridHeight, backgroundColor: "transparent" }}
          theme={MONTH_CALENDAR_THEME}
        />
      </View>

      <View className="mt-3 flex-row justify-between">
        <View className="flex-row items-center gap-1.5">
          <View className="h-1.5 w-1.5 rounded-full bg-negative" />
          <Text className="text-label font-semibold text-muted">− Expense</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="h-1.5 w-1.5 rounded-full bg-positive" />
          <Text className="text-label font-semibold text-muted">+ Income</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="h-2.5 w-2.5 rounded-full border border-positive/45 bg-positive/20" />
          <Text className="text-label font-semibold text-muted">Today</Text>
        </View>
      </View>

      <DayDetailSheet
        isOpen={openDayStartMs !== null}
        onOpenChange={onDaySheetOpenChange}
        dayStartMs={openDayStartMs}
        currency={currency}
      />
    </View>
  );
}
