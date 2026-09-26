import { CalendarProvider, WeekCalendar } from "react-native-calendars";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { TransactionRow } from "@/components/finance/transaction-row";
import { Money } from "@/components/ui/money";
import { EmptyState, SkeletonRows } from "@/components/ui/states";
import { fromMinorUnits } from "@/lib/currency";
import { NativeBottomSheet } from "@/components/native-ui/native-bottom-sheet";
import { formatMoney } from "@/features/dashboard/utils/format";
import type { TransactionSummary } from "@/lib/dashboard-data";

import { merchantVisual } from "../data";
import { useThemeColors } from "@/components/ui/theme";
import { BrandLogo } from "./brand-logo";
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
const WEEK_STRIP_THEME_BASE = {
  calendarBackground: "transparent",
  textDayFontWeight: "700" as const,
  textDayHeaderFontWeight: "700" as const,
};

function formatDayTitle(ms: number): string {
  return new Date(ms).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}

function DayTransactionRow({ item }: { item: TransactionSummary }) {
  const name = item.brandName?.trim() || item.vendor?.trim() || item.category;
  const visual = merchantVisual(item.brandName?.trim() || item.vendor?.trim() || "", item.category);
  return (
    <TransactionRow
      name={name}
      subtitle={item.category}
      meta={formatTime(item.date)}
      logo={{ letter: name.charAt(0).toUpperCase() || "?", tile: visual.tile, ink: visual.ink, img: visual.img }}
      amount={fromMinorUnits(item.amountMinorUnits, item.currency)}
      currency={item.currency}
      direction={item.direction}
    />
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
  const colors = useThemeColors();
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
              theme={{ ...WEEK_STRIP_THEME_BASE, todayTextColor: colors.accentDeep, selectedDayBackgroundColor: colors.ink, selectedDayTextColor: colors.onInk }}
              markedDates={markedDates}
            />
          </CalendarProvider>
        </View>
      )}

      {status === "loading" && items.length === 0 ? (
        <View className="mt-4">
          <SkeletonRows count={3} />
        </View>
      ) : status !== "loading" && items.length === 0 ? (
        <EmptyState compact icon="rupee-receipt" title="No transactions this day" />
      ) : (
        <>
          <View className="mt-3 flex-row items-end justify-between rounded-card bg-fill px-4 py-3.5">
            <View>
              <Text className="text-meta font-medium text-muted">Net</Text>
              <Money
                value={Math.abs(fromMinorUnits(netMinorUnits, currency))}
                currency={currency}
                size="title"
                tone={netMinorUnits > 0 ? "income" : "default"}
                sign={netMinorUnits > 0 ? "income" : netMinorUnits < 0 ? "expense" : "none"}
              />
            </View>
            <View className="items-end">
              <Text className="text-caption text-positive">{amount(incomeMinorUnits, currency)} in</Text>
              <Text className="mt-0.5 text-caption text-ink-soft">{amount(expenseMinorUnits, currency)} out</Text>
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
