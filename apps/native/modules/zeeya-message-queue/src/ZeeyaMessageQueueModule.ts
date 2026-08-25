import { NativeModule, requireOptionalNativeModule } from "expo";

export interface PendingShortcutFile {
  fileName: string;
  contents: string;
}

declare class ZeeyaMessageQueueModule extends NativeModule {
  listPending(): Promise<PendingShortcutFile[]>;
  acknowledge(fileName: string): Promise<void>;
  quarantine(fileName: string): Promise<void>;
}

export default requireOptionalNativeModule<ZeeyaMessageQueueModule>("ZeeyaMessageQueue");
