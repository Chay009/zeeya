import { ActivityIndicator, Pressable, Text, View } from "react-native";

import type { Status } from "@/features/dashboard/hooks/use-dashboard-sync";
import { hp } from "../theme";

export function HomePermissionCard({
  status,
  error,
  progress,
  onConnect,
}: {
  status: Status;
  error: string | null;
  progress?: { scanned: number; inserted: number } | null;
  onConnect: () => Promise<void>;
}) {
  if (status === "ready") return null;

  const checking = status === "checking";
  const loading = status === "loading";
  const busy = checking || loading;
  const needsPermission = status === "needs-permission";
  const unsupported = status === "unsupported";
  const title = needsPermission
    ? "Connect your SMS inbox"
    : unsupported
      ? "SMS access is Android-only"
      : status === "error"
        ? "Couldn't read your inbox"
        : loading
          ? "Reading your inbox"
          : "Checking SMS access";
  const body = needsPermission
    ? "zeeya reads your bank and transaction messages on-device to build your dashboard. Your SMS content never leaves your phone."
    : unsupported
      ? "Android provides the SMS access this dashboard needs. iOS does not allow third-party apps to read the SMS inbox."
      : status === "error"
        ? (error ?? "Something went wrong while reading your inbox.")
        : loading
          ? "Your permission is granted. We are loading and parsing your real transactions."
          : "Checking whether zeeya can read your bank and transaction messages.";

  return (
    <View
      style={{
        marginTop: 18,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: needsPermission ? "#b9dfc5" : hp.border,
        backgroundColor: hp.card,
        padding: 16,
      }}
    >
      <Text style={{ fontSize: 10, fontWeight: "800", letterSpacing: 1.6, color: hp.muted }}>
        {unsupported ? "DEVICE SUPPORT" : "PRIVATE BY DESIGN"}
      </Text>
      <Text style={{ marginTop: 5, fontSize: 17, fontWeight: "800", color: hp.ink }}>{title}</Text>
      <Text style={{ marginTop: 6, fontSize: 13, lineHeight: 19, color: hp.mutedSoft }}>
        {body}
      </Text>

      {needsPermission && (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onConnect}
          style={{
            marginTop: 14,
            alignItems: "center",
            borderRadius: 14,
            backgroundColor: hp.inkDeep,
            paddingVertical: 12,
            opacity: busy ? 0.6 : 1,
          }}
        >
          <Text style={{ color: hp.lime, fontSize: 13, fontWeight: "800" }}>Allow SMS access</Text>
        </Pressable>
      )}

      {busy && (
        <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <ActivityIndicator color={hp.emeraldDeep} size="small" />
          <Text style={{ fontSize: 12, fontWeight: "700", color: hp.emeraldDeep }}>
            {loading
              ? progress
                ? // Counts, not a percentage — the total to scan isn't
                  // known upfront, and a fabricated percentage would be
                  // more misleading than none at all.
                  `Scanned ${progress.scanned}, imported ${progress.inserted}…`
                : "Syncing your inbox…"
              : "Checking permission…"}
          </Text>
        </View>
      )}

      {status === "error" && (
        <Pressable
          accessibilityRole="button"
          onPress={onConnect}
          style={{
            marginTop: 14,
            alignItems: "center",
            borderRadius: 14,
            borderWidth: 1,
            borderColor: hp.border,
            backgroundColor: hp.cardAlt,
            paddingVertical: 11,
          }}
        >
          <Text style={{ color: hp.emeraldDeep, fontSize: 13, fontWeight: "800" }}>Try again</Text>
        </Pressable>
      )}
    </View>
  );
}
