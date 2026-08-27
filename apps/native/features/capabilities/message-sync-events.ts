import type { Dashboard } from "../../lib/dashboard";

type MessageSyncListener = (dashboard: Dashboard) => void;

const listeners = new Set<MessageSyncListener>();

export function subscribeToMessageSync(listener: MessageSyncListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishMessageSync(dashboard: Dashboard): void {
  for (const listener of Array.from(listeners)) {
    listener(dashboard);
  }
}
