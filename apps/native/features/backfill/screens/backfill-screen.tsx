import { router } from "expo-router";
import { Button, Spinner } from "heroui-native";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { Calendar, type DateData } from "react-native-calendars";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "@/components/app-text";
import { MessageArrived } from "@/components/art/message-arrived";
import { Card } from "@/components/ui/card";
import { NavBar } from "@/components/ui/header";
import { Row, RowGroup } from "@/components/ui/list";
import { SCREEN_PADDING_X } from "@/components/ui/screen";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useThemeColors } from "@/components/ui/theme";
import { backfillSms } from "@/db/backfill";
import {
  hasSmsReadPermission,
  isSmsReadSupported,
  readSmsInbox,
  requestSmsReadPermission,
} from "@/lib/sms";

import {
  calendarSelectionToEpochRange,
  selectCalendarDay,
  type CalendarRangeSelection,
} from "../date-range";

type BackfillStatus = "idle" | "running" | "done" | "error";
type PermissionStatus = "checking" | "needs-permission" | "granted" | "error";

const DAY_MS = 24 * 60 * 60 * 1000;

// Presets provide fast paths for common imports; the custom-range calendar
// below covers exact dates. `from: 0` for "All time" reads from the epoch —
// readSmsInbox treats an out-of-range `since` as "no earlier match."
const PRESETS: { label: string; days: number | null }[] = [
  { label: "Last 30 days", days: 30 },
  { label: "Last 3 months", days: 90 },
  { label: "Last 6 months", days: 180 },
  { label: "Last year", days: 365 },
  { label: "All time", days: null },
];

export function BackfillScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<BackfillStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [ingestedCount, setIngestedCount] = useState<number | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [customRange, setCustomRange] = useState<CalendarRangeSelection | null>(null);
  // Reaching this screen (via the dashboard's header icon) doesn't itself
  // prove SMS capture permissions were granted — the dashboard's own status
  // gates only its own load(), not navigation to other routes. Checked
  // independently here rather than assumed, so tapping a preset without
  // permission shows a real "grant access" prompt instead of readSmsInbox
  // failing opaquely mid-backfill.
  const [permission, setPermission] = useState<PermissionStatus>("checking");

  useEffect(() => {
    if (!isSmsReadSupported()) return;
    hasSmsReadPermission()
      .then((granted) => {
        setPermission(granted ? "granted" : "needs-permission");
      })
      .catch(() => {
        // Without this, a rejection here (PermissionsAndroid.check itself
        // failing, however unlikely) would leave `permission` stuck on
        // "checking" forever — the presets never appear, and there's no
        // way for the user to retry, since nothing ever prompts again.
        setPermission("error");
      });
  }, []);

  function handleClose() {
    router.back();
  }

  const grantPermission = useCallback(async () => {
    try {
      const granted = await requestSmsReadPermission();
      setPermission(granted ? "granted" : "needs-permission");
    } catch {
      setPermission("error");
    }
  }, []);

  const runBackfill = useCallback(async (label: string, days: number | null) => {
    setStatus("running");
    setSelectedLabel(label);
    setError(null);
    try {
      const to = Date.now();
      const from = days === null ? 0 : to - days * DAY_MS;
      const result = await backfillSms({ from, to }, readSmsInbox);
      setIngestedCount(result.insertedCount);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, []);

  const runCustomBackfill = useCallback(async () => {
    if (!customRange?.to) return;
    setStatus("running");
    setSelectedLabel("Custom range");
    setError(null);
    try {
      const result = await backfillSms(calendarSelectionToEpochRange(customRange), readSmsInbox);
      setIngestedCount(result.insertedCount);
      setStatus("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("error");
    }
  }, [customRange]);

  const markedDates = customRange
    ? {
        [customRange.from]: {
          startingDay: true,
          endingDay: customRange.to === customRange.from,
          color: colors.accent,
          textColor: colors.onAccent,
        },
        ...(customRange.to
          ? {
              [customRange.to]: {
                startingDay: customRange.to === customRange.from,
                endingDay: true,
                color: colors.accent,
                textColor: colors.onAccent,
              },
            }
          : {}),
      }
    : {};

  const running = status === "running";

  return (
    <View className="flex-1 bg-background">
      <NavBar title="Backfill history" onBack={handleClose} topInset={insets.top} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: SCREEN_PADDING_X,
          paddingBottom: insets.bottom + 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        {!isSmsReadSupported() ? (
          <EmptyState
            icon="shield"
            art="hero-shield"
            title="Historical messages are unavailable on iOS"
            body="Apple does not provide apps access to your existing Messages history. Zeeya can capture new financial messages after you configure its Personal Automation in Shortcuts from Privacy & automation settings."
          />
        ) : permission === "checking" ? (
          <Text className="mt-4 text-caption text-muted">Checking permissions…</Text>
        ) : permission === "error" ? (
          <ErrorState
            compact
            title="Couldn't check SMS permission."
            body="Grant message access, then try again."
            onRetry={() => void grantPermission()}
          />
        ) : permission === "needs-permission" ? (
          <EmptyState
            compact
            icon="shield"
            art="hero-shield"
            title="SMS access needed"
            body="Backfill needs SMS read access, same as the dashboard."
            actionLabel="Allow SMS Access"
            onAction={() => void grantPermission()}
          />
        ) : (
          <>
            <Text className="mt-2 text-caption leading-5 text-muted">
              Import older bank messages Zeeya hasn't read yet.
            </Text>
            <Text className="mt-1 text-caption leading-5 text-muted">
              Messages already imported are skipped, so you can run this again.
            </Text>

            <View className="mt-4">
              <RowGroup>
                {PRESETS.map((preset) => {
                  const isActive = running && selectedLabel === preset.label;
                  return (
                    <View
                      key={preset.label}
                      style={{ opacity: running && !isActive ? 0.5 : 1 }}
                    >
                      <Row
                        title={preset.label}
                        trailing={isActive ? <Spinner size="sm" /> : undefined}
                        onPress={
                          running ? undefined : () => void runBackfill(preset.label, preset.days)
                        }
                      />
                    </View>
                  );
                })}
              </RowGroup>
            </View>

            <Button
              variant="secondary"
              className="mt-3 w-full"
              isDisabled={running}
              onPress={() => setShowCustomRange((visible) => !visible)}
            >
              <Button.Label>Choose custom dates</Button.Label>
            </Button>

            {showCustomRange ? (
              <Card className="mt-4">
                <Calendar
                  markingType="period"
                  markedDates={markedDates}
                  maxDate={new Date().toISOString().slice(0, 10)}
                  enableSwipeMonths
                  onDayPress={(day: DateData) =>
                    setCustomRange((current) => selectCalendarDay(current, day.dateString))
                  }
                  theme={{
                    calendarBackground: colors.card,
                    dayTextColor: colors.ink,
                    monthTextColor: colors.ink,
                    textDisabledColor: colors.muted,
                    arrowColor: colors.accent,
                    todayTextColor: colors.accent,
                  }}
                />
                <Button
                  className="mt-3 w-full"
                  isDisabled={!customRange?.to || running}
                  onPress={() => void runCustomBackfill()}
                >
                  <Button.Label>
                    {customRange?.to
                      ? `Import ${customRange.from} to ${customRange.to}`
                      : "Choose a start and end date"}
                  </Button.Label>
                </Button>
              </Card>
            ) : null}

            {status === "done" && (
              <View className="mt-5 items-center gap-3">
                <MessageArrived size={88} />
                <Text className="text-center text-caption text-positive">
                  Backfill complete
                  {ingestedCount !== null
                    ? // insertedCount is every newly-persisted message, not
                      // just financial transactions — it includes parser
                      // errors and non-transaction categories too, so "N new
                      // messages imported" is what this number actually is.
                      ` — ${ingestedCount} new message${ingestedCount === 1 ? "" : "s"} imported.`
                    : "."}
                </Text>
              </View>
            )}

            {status === "error" && (
              <Text className="mt-4 text-caption text-negative">Backfill failed: {error}</Text>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
