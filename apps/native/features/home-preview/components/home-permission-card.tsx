import { Button, Spinner, Surface } from "heroui-native";
import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";

import type { Status } from "@/features/dashboard/hooks/dashboard-sync-provider";

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
    <Surface className="mt-4 rounded-card p-4">
      <Text className="text-label font-extrabold tracking-wider text-muted">
        {unsupported ? "DEVICE SUPPORT" : "PRIVATE BY DESIGN"}
      </Text>
      <Text className="mt-1 text-title font-extrabold text-ink">{title}</Text>
      <Text className="mt-2 text-caption leading-5 text-muted-soft">{body}</Text>

      {needsPermission && (
        <Button className="mt-4" isDisabled={busy} onPress={onConnect}>
          Allow SMS access
        </Button>
      )}

      {busy && (
        <View className="mt-4 flex-row items-center gap-2">
          <Spinner size="sm" />
          <Text className="text-caption font-bold text-accent-deep">
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
        <Button className="mt-4" variant="secondary" onPress={onConnect}>
          Try again
        </Button>
      )}
    </Surface>
  );
}
