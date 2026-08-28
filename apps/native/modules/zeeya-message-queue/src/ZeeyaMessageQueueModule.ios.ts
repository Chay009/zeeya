import { requireOptionalNativeModule, type NativeModule } from "expo-modules-core";

import type { PendingShortcutFile } from "./types";

interface IosMessageQueueModule extends NativeModule {
  listPending(): Promise<PendingShortcutFile[]>;
  acknowledge(fileName: string): Promise<void>;
  quarantine(fileName: string): Promise<void>;
}

export default requireOptionalNativeModule<IosMessageQueueModule>("ZeeyaMessageQueue");
