export interface PendingShortcutFile {
  fileName: string;
  contents: string;
}

export interface PendingSmsSignal {
  generation: number;
  count: number;
  lastReceivedAt: number;
}
