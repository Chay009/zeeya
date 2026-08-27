import { Platform } from "react-native";

import ZeeyaMessageQueueModule from "../../modules/zeeya-message-queue/src/ZeeyaMessageQueueModule.android";
import type { PendingSmsSignal } from "../../modules/zeeya-message-queue/src/types";
import { startRealtimeSmsMonitoring, type RealtimeSmsSignalSource } from "./realtime-sms-monitor";

export function subscribeToRealtimeSms(
  sync: () => Promise<unknown>,
  reportError: (error: unknown) => void,
): () => void {
  if (Platform.OS !== "android" || !ZeeyaMessageQueueModule) return () => undefined;
  const nativeModule = ZeeyaMessageQueueModule;

  const source: RealtimeSmsSignalSource = {
    peekPendingSmsSignal: () => nativeModule.peekPendingSmsSignal(),
    acknowledgePendingSmsSignal: (signal) =>
      nativeModule.acknowledgePendingSmsSignal(signal.generation),
    addSmsReceivedListener(listener) {
      return nativeModule.addListener("onSmsReceived", (signal: PendingSmsSignal) =>
        listener(signal),
      );
    },
  };

  return startRealtimeSmsMonitoring({ source, sync, reportError });
}
