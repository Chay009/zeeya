import type { DevicePlatform } from "@/lib/device-message-policy";

/**
 * Realtime Android capture is an explicit automation capability. Foreground
 * inbox reads do not use this predicate and only require READ_SMS.
 */
export function shouldSubscribeToRealtimeSms(
  platform: DevicePlatform,
  backgroundSyncEnabled: boolean,
  hasCapturePermissions: boolean,
): boolean {
  return platform === "android" && backgroundSyncEnabled && hasCapturePermissions;
}
