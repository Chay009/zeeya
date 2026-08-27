import ZeeyaMessageQueueModule from "../../modules/zeeya-message-queue/src/ZeeyaMessageQueueModule.ios";
import type { ShortcutMessageQueue } from "../../db/shortcut-sync";

export function getShortcutMessageQueue(): ShortcutMessageQueue {
  const nativeQueue = ZeeyaMessageQueueModule;
  if (!nativeQueue) {
    throw new Error(
      "Apple Shortcuts capture is unavailable in this build. Install a new iOS development build.",
    );
  }
  return {
    listPending: () => nativeQueue.listPending(),
    acknowledge: (fileName) => nativeQueue.acknowledge(fileName),
    quarantine: (fileName) => nativeQueue.quarantine(fileName),
  };
}
