// "A device-message sync just finished" — published by the capability layer
// (a real-time SMS or foreground catch-up) so the dashboard store can
// refresh its sync-state (the caught-up batch). Carries no data: screens read
// SQLite and update live when the sync's publish lands.

type MessageSyncListener = () => void;

const listeners = new Set<MessageSyncListener>();

export function subscribeToMessageSync(listener: MessageSyncListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishMessageSync(): void {
  for (const listener of Array.from(listeners)) {
    listener();
  }
}
