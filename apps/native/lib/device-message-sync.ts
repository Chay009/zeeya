import { Platform } from "react-native";

import { drainShortcutInbox } from "../db/shortcut-sync";
import { syncInbox, type SyncProgress } from "../db/sync";
import { getShortcutMessageQueue } from "../features/shortcuts/queue";
import type { Dashboard } from "./dashboard";
import { deviceMessagePolicy } from "./device-message-policy";
import { readSmsInbox } from "./sms";

function currentPolicy() {
  return deviceMessagePolicy(
    Platform.OS === "android" || Platform.OS === "ios" || Platform.OS === "web"
      ? Platform.OS
      : "other",
  );
}

export function isDeviceMessageCaptureSupported(): boolean {
  return currentPolicy().supported;
}

export function deviceMessageCaptureRequiresReadPermission(): boolean {
  return currentPolicy().requiresSmsReadPermission;
}

export async function syncDeviceMessages(
  options: { onProgress?: (progress: SyncProgress) => void } = {},
): Promise<Dashboard> {
  const policy = currentPolicy();
  // onProgress is only meaningful for the paginated direct-inbox path —
  // the Apple Shortcuts queue is drained in one shot with no comparable
  // multi-page scan, so there's nothing to report progress on there.
  if (policy.capture === "direct-inbox") {
    return syncInbox(readSmsInbox, { onProgress: options.onProgress });
  }
  if (policy.capture === "apple-shortcuts") {
    const result = await drainShortcutInbox(getShortcutMessageQueue());
    if (result.rejected.length > 0) {
      console.warn("Zeeya quarantined malformed Shortcut messages", result.rejected);
    }
    return result.dashboard;
  }
  throw new Error("Financial-message capture is unavailable on this platform.");
}
