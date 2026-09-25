import { CalendarProvider, WeekCalendar } from "react-native-calendars";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { NativeBottomSheet } from "@/components/native-ui/native-bottom-sheet";
import { formatMoney } from "@/features/dashboard/utils/format";
import { fromMinorUnits } from "@/lib/currency";
import type { TransactionSummary } from "@/lib/dashboard-data";
import { moneyFontFamily } from "@/lib/fonts";

import { merchantVisual } from "../data";
import { hp } from "../theme";
import { BrandLogo } from "./brand-logo";
import { EmptyNote } from "./empty-note";
import { useDayTransactions } from "../hooks/use-day-transactions";

// 'yyyy-MM-dd', local calendar date — react-native-calendars' own dateString
// format, used by CalendarProvider/WeekCalendar's `date`/`current` props.
function toDateString(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The inverse of toDateString. Parses the plain 'yyyy-MM-dd' pieces as
// numbers and builds a local-midnight epoch from them directly — no UTC
// parsing ambiguity, unlike DateData.timestamp (see this-week-calendar-tab.tsx's
// openDay for why that field isn't trusted directly).
function fromDateString(dateString: string): number {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year!, month! - 1, day!).getTime();
}

function amount(value: number, currency: string): string {
  return formatMoney(fromMinorUnits(value, currency), currency);
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

// WeekCalendar reads styleConstructor(theme) once at mount (useRef, never
// updated on theme changes — see WeekCalendar/new.js), so a fresh object
// here every render buys nothing but allocation churn; hoisted since it
// never depends on props or state.
const WEEK_STRIP_THEME = {
  calendarBackground: "transparent",
  todayTextColor: hp.accent,
  selectedDayBackgroundColor: hp.accent,
  selectedDayTextColor: hp.onInk,
  textDayFontWeight: "700" as const,
  textDayHeaderFontWeight: "700" as const,
};

function formatDayTitle(ms: number): string {
  return new Date(ms).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}

function DayTransactionRow({ item }: { item: TransactionSummary }) {
  const name = item.brandName?.trim() || item.vendor?.trim() || item.category;
  const visual = merchantVisual(item.brandName?.trim() || item.vendor?.trim() || "", item.category);
  const isIncome = item.direction === "income";

  return (
    <View className="flex-row items-center gap-3 py-3">
      <View className="shrink-0">
        <BrandLogo
          letter={name.charAt(0).toUpperCase() || "?"}
          tile={visual.tile}
          ink={visual.ink}
          img={visual.img}
          size={40}
          radius={20}
          iconRatio={0.62}
        />
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-subtitle font-semibold text-ink">
          {name}
        </Text>
        <Text className="mt-0.5 text-label text-muted">{formatTime(item.date)}</Text>
      </View>
      <Text
        numberOfLines={1}
        className={`text-subtitle font-semibold ${isIncome ? "text-positive" : "text-coral"}`}
        style={{ fontFamily: moneyFontFamily("medium") }}
      >
        {isIncome ? "+" : "−"}
        {amount(item.amountMinorUnits, item.currency)}
      </Text>
    </View>
  );
}

export function DayDetailSheet({
  isOpen,
  onOpenChange,
  dayStartMs,
  currency,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  dayStartMs: number | null;
  currency: string;
}) {
  // The sheet's own shown day, distinct from the tapped-day prop — once
  // open, the week strip can move the user to a different day without the
  // parent calendar tab needing to know or re-render for it.
  const [shownDayMs, setShownDayMs] = useState(dayStartMs);
  useEffect(() => {
    if (isOpen) setShownDayMs(dayStartMs);
  }, [isOpen, dayStartMs]);

  const { status, items } = useDayTransactions(isOpen ? shownDayMs : null, currency);

  // CalendarProvider is the single source of truth for "which date is
  // shown" once the strip is mounted — its own onDateChanged callback
  // (fired from a day tap or a week swipe alike) is what updates our
  // shownDayMs, not the other way around. Feeding `date`/`current` from
  // shownDayMs back into the provider on every tap was a real bug in our
  // own code: WeekCalendar's internal onDayPress already calls
  // context.setDate(...) synchronously, so re-supplying a new `date` prop
  // right after made CalendarProvider's useDidUpdate([date]) fire a SECOND,
  // redundant _setDate for the same tap — which in turn re-triggered
  // WeekCalendar's own useEffect([date]) a second time, doubling the
  // work (and thus the visible delay) on every single tap. The provider's
  // `date` prop below is only ever set once, from the openKey the sheet
  // was opened with, and never re-derived from shownDayMs afterward.
  const openKey = isOpen ? toDateString(dayStartMs ?? Date.now()) : null;
  const onCalendarDateChanged = useCallback((dateString: string) => {
    setShownDayMs(fromDateString(dateString));
  }, []);
  const shownDateString = shownDayMs !== null ? toDateString(shownDayMs) : null;
  const markedDates = useMemo(
    () => (shownDateString ? { [shownDateString]: { selected: true } } : undefined),
    [shownDateString],
  );

  const netMinorUnits = items.reduce(
    (total, item) =>
      total + (item.direction === "income" ? item.amountMinorUnits : -item.amountMinorUnits),
    0,
  );
  const incomeMinorUnits = items
    .filter((item) => item.direction === "income")
    .reduce((total, item) => total + item.amountMinorUnits, 0);
  const expenseMinorUnits = items
    .filter((item) => item.direction === "expense")
    .reduce((total, item) => total + item.amountMinorUnits, 0);

  return (
    <NativeBottomSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={shownDayMs !== null ? formatDayTitle(shownDayMs) : ""}
      snapPoints={["70%", "90%"]}
    >
      {openKey !== null && (
        <View className="-mx-1">
          <CalendarProvider key={openKey} date={openKey} onDateChanged={onCalendarDateChanged}>
            <WeekCalendar
              firstDay={1}
              allowShadow={false}
              theme={WEEK_STRIP_THEME}
              markedDates={markedDates}
            />
          </CalendarProvider>
        </View>
      )}

      {status === "loading" && items.length === 0 ? (
        <View className="items-center py-10">
          <Text className="text-caption text-muted">Loading transactions…</Text>
        </View>
      ) : status !== "loading" && items.length === 0 ? (
        <EmptyNote
          icon="rupee-receipt"
          title="No transactions this day"
          body="Nothing was captured for this date."
        />
      ) : (
        <>
          <View className="mt-3 flex-row items-center justify-between rounded-card bg-accent-soft px-4 py-3">
            <View>
              <Text
                className={`text-[22px] tracking-tight ${netMinorUnits >= 0 ? "text-positive" : "text-coral"}`}
                style={{ fontFamily: moneyFontFamily("semibold") }}
              >
                {netMinorUnits >= 0 ? "+" : "−"}
                {amount(Math.abs(netMinorUnits), currency)}
              </Text>
              <Text className="mt-0.5 text-caption text-muted">net</Text>
            </View>
            <View className="items-end gap-1">
              <Text className="text-caption text-positive">{amount(incomeMinorUnits, currency)} in</Text>
              <Text className="text-caption text-coral">{amount(expenseMinorUnits, currency)} out</Text>
            </View>
          </View>

          <ScrollView className="mt-2" showsVerticalScrollIndicator={false}>
            {items.map((item) => (
              <DayTransactionRow key={item.id} item={item} />
            ))}
          </ScrollView>
        </>
      )}
    </NativeBottomSheet>
  );
}
