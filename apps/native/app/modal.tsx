import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { Container } from "@/components/container";
import { dashboardTheme as t } from "@/constants/dashboard-theme";
import { backfillSms } from "@/db/backfill";
import { loadDashboard } from "@/db/ingestion";
import { isSmsReadSupported, readSmsInbox } from "@/lib/sms";

type BackfillStatus = "idle" | "running" | "done" | "error";

const DAY_MS = 24 * 60 * 60 * 1000;

// Fixed presets rather than a free-form calendar picker: no date-picker
// dependency is installed yet, and a handful of named ranges covers the
// realistic backfill need (catching up an inbox this app hasn't seen
// before) without pulling in and native-linking a new library for this
// alone. `from: 0` for "All time" reads from the epoch — readSmsInbox
// already treats an out-of-range `since` as "no earlier match," so this
// needs no special-casing.
const PRESETS: { label: string; days: number | null }[] = [
  { label: "Last 30 days", days: 30 },
  { label: "Last 3 months", days: 90 },
  { label: "Last 6 months", days: 180 },
  { label: "Last year", days: 365 },
  { label: "All time", days: null },
];

function Modal() {
  const [status, setStatus] = useState<BackfillStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [ingestedCount, setIngestedCount] = useState<number | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  function handleClose() {
    router.back();
  }

  const runBackfill = useCallback(async (label: string, days: number | null) => {
    setStatus("running");
    setSelectedLabel(label);
    setError(null);
    try {
      const to = Date.now();
      const from = days === null ? 0 : to - days * DAY_MS;
      const before = await loadDashboard();
      const after = await backfillSms({ from, to }, readSmsInbox);
      setIngestedCount(after.activity.length - before.activity.length);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, []);

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
          <Text style={{ color: t.textMuted, fontSize: 13 }}>
            Reading the SMS inbox isn't possible on iOS.
          </Text>
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
            </View>

            {status === "done" && (
              <Text style={{ color: t.positive, fontSize: 13, marginTop: 18 }}>
                Backfill complete
                {ingestedCount !== null
                  ? ` — ${ingestedCount} new recognized transaction${ingestedCount === 1 ? "" : "s"} added.`
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

export default Modal;
