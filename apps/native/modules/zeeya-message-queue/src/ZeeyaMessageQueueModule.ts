import { NativeModule, requireOptionalNativeModule } from "expo";

export interface PendingShortcutFile {
  fileName: string;
  contents: string;
}

export interface PendingSmsSignal {
  count: number;
  lastReceivedAt: number;
}

type ZeeyaMessageQueueEvents = {
  onSmsReceived(signal: PendingSmsSignal): void;
};

declare class ZeeyaMessageQueueModule extends NativeModule<ZeeyaMessageQueueEvents> {
  listPending(): Promise<PendingShortcutFile[]>;
  acknowledge(fileName: string): Promise<void>;
  quarantine(fileName: string): Promise<void>;
  consumePendingSmsSignal(): Promise<PendingSmsSignal | null>;
}

export default requireOptionalNativeModule<ZeeyaMessageQueueModule>("ZeeyaMessageQueue");
