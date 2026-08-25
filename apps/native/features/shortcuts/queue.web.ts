import type { ShortcutMessageQueue } from "../../db/shortcut-sync";

export function getShortcutMessageQueue(): ShortcutMessageQueue {
  throw new Error("Apple Shortcuts capture is available only in the iOS app.");
}
