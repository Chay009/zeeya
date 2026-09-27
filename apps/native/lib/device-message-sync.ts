import { Platform } from "react-native";

import { drainShortcutInbox } from "../db/shortcut-sync";
import { syncInboxChanges, type SyncProgress } from "../db/sync";
import { getShortcutMessageQueue } from "../features/shortcuts/queue";
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

// Brings the local ledger (and, when anything changed, the published
// projection) up to date with the device's messages. Returns nothing: screens
// read SQLite and update live when a publish lands (lib/live-queries.ts), so
// no caller needs a derived Dashboard — and a sync that found nothing new
// never derives one.
export async function syncDeviceMessages(
  options: { onProgress?: (progress: SyncProgress) => void } = {},
): Promise<void> {
  const policy = currentPolicy();
  // onProgress is only meaningful for the paginated direct-inbox path —
  // the Apple Shortcuts queue is drained in one shot with no comparable
  // multi-page scan, so there's nothing to report progress on there.
  if (policy.capture === "direct-inbox") {
    await syncInboxChanges(readSmsInbox, { onProgress: options.onProgress });
    return;
  }
  if (policy.capture === "apple-shortcuts") {
    const result = await drainShortcutInbox(getShortcutMessageQueue());
    if (result.rejected.length > 0) {
      console.warn("Zeeya quarantined malformed Shortcut messages", result.rejected);
    }
    return;
  }
  throw new Error("Financial-message capture is unavailable on this platform.");
}
