import { Platform } from "react-native";

import ZeeyaMessageQueueModule, {
  type PendingSmsSignal,
} from "../../modules/zeeya-message-queue/src/ZeeyaMessageQueueModule";
import { startRealtimeSmsMonitoring, type RealtimeSmsSignalSource } from "./realtime-sms-monitor";

export function subscribeToRealtimeSms(
  sync: () => Promise<unknown>,
  reportError: (error: unknown) => void,
): () => void {
  if (Platform.OS !== "android" || !ZeeyaMessageQueueModule) return () => undefined;
  const nativeModule = ZeeyaMessageQueueModule;

  const source: RealtimeSmsSignalSource = {
    consumePendingSmsSignal: () => nativeModule.consumePendingSmsSignal(),
    addSmsReceivedListener(listener) {
      return nativeModule.addListener("onSmsReceived", (signal: PendingSmsSignal) =>
        listener(signal),
      );
    },
  };

  return startRealtimeSmsMonitoring({ source, sync, reportError });
}
