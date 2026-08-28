import { requireOptionalNativeModule, type NativeModule } from "expo-modules-core";

import type { PendingSmsSignal } from "./types";

type AndroidMessageQueueEvents = {
  onSmsReceived(signal: PendingSmsSignal): void;
};

interface AndroidMessageQueueModule extends NativeModule<AndroidMessageQueueEvents> {
  peekPendingSmsSignal(): Promise<PendingSmsSignal | null>;
  acknowledgePendingSmsSignal(generation: number): Promise<void>;
  addListener(
    eventName: "onSmsReceived",
    listener: (signal: PendingSmsSignal) => void,
  ): { remove(): void };
}

export default requireOptionalNativeModule<AndroidMessageQueueModule>("ZeeyaMessageQueue");
