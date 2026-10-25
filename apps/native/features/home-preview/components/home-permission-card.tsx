import { Button, Spinner, Surface } from "heroui-native";
import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { MessageArrived } from "@/components/art/message-arrived";
import { IconTile } from "@/components/ui/controls";
import { useThemeColors } from "@/components/ui/theme";

import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";

// Owns its sync subscription: `progress` ticks once per inbox page during a
// scan, and only this card should re-render for it — not the screen hosting it.
export function HomePermissionCard({
  hasData = false,
}: {
  /** The screen already shows real data — a background catch-up is a hint, not a blocker. */
  hasData?: boolean;
}) {
  const colors = useThemeColors();
  const {
    status,
    error,
    progress,
    connect: onConnect,
  } = useDashboardSync((state) => ({
    status: state.status,
    error: state.error,
    progress: state.progress,
    connect: state.connect,
  }));
  if (status === "ready") return null;

  const checking = status === "checking";
  const loading = status === "loading";
  const busy = checking || loading;

  if (busy && hasData) {
    return (
      <View className="mt-3 flex-row items-center gap-2 self-start rounded-pill bg-card px-3 py-1.5">
        <Spinner size="sm" />
        <Text className="text-meta font-medium text-muted">
          {loading && progress ? `Checking new messages · ${progress.inserted} new` : "Checking for new messages"}
        </Text>
      </View>
    );
  }
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

  const asking = needsPermission || unsupported;

  return (
    <Surface className="mt-4 rounded-card p-5">
      {asking ? (
        <View className="mb-4 items-center">
          <MessageArrived size={96} on="card" />
        </View>
      ) : (
        <View className="mb-3 flex-row items-center gap-3">
          <IconTile icon="shield" color={colors.accentDeep} background={colors.accentSoft} size={36} />
        </View>
      )}
      <Text className="text-caption font-medium text-muted">
        {unsupported ? "Device support" : "Private by design"}
      </Text>
      <Text className="mt-3 text-subtitle font-semibold text-ink">{title}</Text>
      <Text className="mt-1 text-caption text-muted">{body}</Text>

      {needsPermission && (
        <Button className="mt-4" isDisabled={busy} onPress={onConnect}>
          Allow SMS access
        </Button>
      )}

      {busy && (
        <View className="mt-4 flex-row items-center gap-2">
          <Spinner size="sm" />
          <Text className="text-caption font-medium text-ink-soft">
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
