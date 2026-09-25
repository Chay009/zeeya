import type { LocalSettings } from "@/db/settings";

/**
 * The JS listener is foreground-only. A backgrounded process must leave the
 * native pending signal untouched for Android's OS-notification/background
 * path instead of silently consuming it in a still-alive JS runtime.
 */
export function shouldSubscribeToRealtimeSms(
  platform: string,
  appIsActive: boolean,
  hasCapturePermissions: boolean,
): boolean {
  return platform === "android" && appIsActive && hasCapturePermissions;
}

export function shouldNotifyBackgroundSms(
  settings: Pick<LocalSettings, "backgroundSyncEnabled" | "transactionNotificationsEnabled">,
): boolean {
  return settings.backgroundSyncEnabled && settings.transactionNotificationsEnabled;
}
