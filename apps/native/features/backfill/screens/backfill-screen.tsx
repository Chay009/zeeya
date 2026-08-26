import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Calendar, type DateData } from "react-native-calendars";

import { Container } from "@/components/container";
import { dashboardTheme as t } from "@/constants/dashboard-theme";
import { backfillSms } from "@/db/backfill";
import {
  hasSmsCapturePermissions,
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
    hasSmsCapturePermissions()
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
          color: t.accent,
          textColor: t.background,
        },
        ...(customRange.to
          ? {
              [customRange.to]: {
                startingDay: customRange.to === customRange.from,
                endingDay: true,
                color: t.accent,
                textColor: t.background,
              },
            }
          : {}),
      }
    : {};

  return (
    <Container>
      <View style={{ flex: 1, padding: 20, backgroundColor: t.background }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <Text style={{ color: t.textPrimary, fontSize: 20, fontWeight: "800" }}>
            Backfill history
          </Text>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={t.textMuted} />
          </Pressable>
        </View>

        {!isSmsReadSupported() ? (
          <View style={{ gap: 10 }}>
            <Text style={{ color: t.textPrimary, fontSize: 15, fontWeight: "700" }}>
              Historical Messages are unavailable on iOS
            </Text>
            <Text style={{ color: t.textMuted, fontSize: 13, lineHeight: 20 }}>
              Apple does not provide apps access to your existing Messages history. Zeeya can
              capture new financial messages after you configure its Personal Automation in
              Shortcuts from Privacy & automation settings.
            </Text>
          </View>
        ) : permission === "checking" ? (
          <Text style={{ color: t.textMuted, fontSize: 13 }}>Checking permissions…</Text>
        ) : permission === "error" ? (
          <View>
            <Text style={{ color: t.negative, fontSize: 13, marginBottom: 14 }}>
              Couldn't check SMS permission.
            </Text>
            <Pressable
              onPress={() => void grantPermission()}
              style={{
                backgroundColor: t.accent,
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: "center",
              }}
            >
              <Text style={{ color: t.background, fontWeight: "700" }}>Try again</Text>
            </Pressable>
          </View>
        ) : permission === "needs-permission" ? (
          <View>
            <Text style={{ color: t.textMuted, fontSize: 13, marginBottom: 14 }}>
              Backfill needs SMS read access, same as the dashboard.
            </Text>
            <Pressable
              onPress={() => void grantPermission()}
              style={{
                backgroundColor: t.accent,
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: "center",
              }}
            >
              <Text style={{ color: t.background, fontWeight: "700" }}>Allow SMS Access</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={{ color: t.textMuted, fontSize: 13, marginBottom: 18 }}>
              Import older bank and transaction messages beyond what zeeya has already synced.
              Already-ingested messages are recognized and never re-parsed, so it's safe to run this
              more than once or with overlapping ranges.
            </Text>

            <View style={{ gap: 10 }}>
              {PRESETS.map((preset) => {
                const isActive = status === "running" && selectedLabel === preset.label;
                return (
                  <Pressable
                    key={preset.label}
                    disabled={status === "running"}
                    onPress={() => void runBackfill(preset.label, preset.days)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      backgroundColor: t.surface,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: t.border,
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      opacity: status === "running" && !isActive ? 0.5 : 1,
                    }}
                  >
                    <Text style={{ color: t.textPrimary, fontWeight: "600", fontSize: 14 }}>
                      {preset.label}
                    </Text>
                    {isActive && <ActivityIndicator size="small" color={t.accent} />}
                  </Pressable>
                );
              })}
              <Pressable
                disabled={status === "running"}
                onPress={() => setShowCustomRange((visible) => !visible)}
                style={{
                  backgroundColor: t.surface,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: t.accent,
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                }}
              >
                <Text style={{ color: t.textPrimary, fontWeight: "600", fontSize: 14 }}>
                  Choose custom dates
                </Text>
              </Pressable>
            </View>

            {showCustomRange ? (
              <View style={{ marginTop: 16, borderRadius: 16, overflow: "hidden" }}>
                <Calendar
                  markingType="period"
                  markedDates={markedDates}
                  maxDate={new Date().toISOString().slice(0, 10)}
                  enableSwipeMonths
                  onDayPress={(day: DateData) =>
                    setCustomRange((current) => selectCalendarDay(current, day.dateString))
                  }
                  theme={{
                    calendarBackground: t.surface,
                    dayTextColor: t.textPrimary,
                    monthTextColor: t.textPrimary,
                    textDisabledColor: t.textMuted,
                    arrowColor: t.accent,
                    todayTextColor: t.accent,
                  }}
                />
                <Pressable
                  disabled={!customRange?.to || status === "running"}
                  onPress={() => void runCustomBackfill()}
                  style={{
                    alignItems: "center",
                    backgroundColor: t.accent,
                    paddingVertical: 13,
                    opacity: customRange?.to && status !== "running" ? 1 : 0.45,
                  }}
                >
                  <Text style={{ color: t.background, fontWeight: "800" }}>
                    {customRange?.to
                      ? `Import ${customRange.from} to ${customRange.to}`
                      : "Choose a start and end date"}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {status === "done" && (
              <Text style={{ color: t.positive, fontSize: 13, marginTop: 18 }}>
                Backfill complete
                {ingestedCount !== null
                  ? // insertedCount is every newly-persisted message, not
                    // just financial transactions — it includes parser
                    // errors and non-transaction categories too, so "N new
                    // messages imported" is what this number actually is.
                    ` — ${ingestedCount} new message${ingestedCount === 1 ? "" : "s"} imported.`
                  : "."}
              </Text>
            )}

            {status === "error" && (
              <Text style={{ color: t.negative, fontSize: 13, marginTop: 18 }}>
                Backfill failed: {error}
              </Text>
            )}
          </>
        )}
      </View>
    </Container>
  );
}
