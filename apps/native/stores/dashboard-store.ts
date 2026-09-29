import { AppState } from "react-native";
import { create } from "zustand";

import {
  acknowledgeCaughtUpTransactions,
  queryCaughtUpTransactions,
  type CaughtUpTransactionBatch,
} from "@/db/caught-up-transactions";
import {
  deviceMessageCaptureRequiresReadPermission,
  isDeviceMessageCaptureSupported,
  syncDeviceMessages,
} from "@/lib/device-message-sync";
import type { SyncProgress } from "@/db/sync";
import { hasSmsReadPermission, requestSmsCapturePermissions } from "@/lib/sms";
import { subscribeToMessageSync } from "@/features/capabilities/message-sync-events";

export type DashboardSyncStatus =
  | "checking"
  | "needs-permission"
  | "loading"
  | "ready"
  | "unsupported"
  | "error";

// Sync STATE only — status, progress, the caught-up batch. Financial data
// lives in SQLite and reaches screens through live local queries
// (lib/live-queries.ts), never through this store; no derived Dashboard is
// held in memory.
//
// Read it with a selector (useDashboardSync(selector)): progress ticks once
// per inbox page during a sync, and a whole-store subscription would
// re-render every mounted tab on each tick.
export interface DashboardStoreState {
  status: DashboardSyncStatus;
  error: string | null;
  // Bumped after every completed sync (initial load, refresh, or a
  // message-sync push). Screens don't need it — local queries are live — it
  // remains for the settings account-count hook.
  syncRevision: number;
  refreshing: boolean;
  progress: { scanned: number; inserted: number } | null;
  // Transactions whose SMS arrived since the user last dismissed the
  // "while you were away" dialog — read from SQLite's append-only arrival
  // log (db/caught-up-transactions.ts), so it survives restarts and never
  // depends on diffing two in-memory snapshots.
  caughtUpTransactions: CaughtUpTransactionBatch;
  // Starts picking up new SMS as they arrive. Safe to call more than once.
  // Returns the function that stops it.
  start: () => () => void;
  dismissCaughtUp: () => Promise<void>;
  connect: () => Promise<void>;
  onRefresh: () => Promise<void>;
}

const CAUGHT_UP_PREVIEW_LIMIT = 8;

// Bumped on every load, so a slow read that finishes late can't overwrite a
// newer one's result.
let loadId = 0;
let listeningForNewMessages = false;
let unsubscribe: (() => void) | null = null;
const EMPTY_CAUGHT_UP_TRANSACTIONS: CaughtUpTransactionBatch = {
  items: [],
  total: 0,
  throughSequence: 0,
};

// The unseen batch, with the cursor advanced past arrivals that carried no
// transaction (OTPs, delivery notices...) so they can't hold the dialog open.
async function readCaughtUp(): Promise<CaughtUpTransactionBatch> {
  const caughtUp = await queryCaughtUpTransactions({ limit: CAUGHT_UP_PREVIEW_LIMIT });
  if (caughtUp.total === 0 && caughtUp.throughSequence > 0) {
    await acknowledgeCaughtUpTransactions(caughtUp.throughSequence);
  }
  return caughtUp;
}

export const useDashboardStore = create<DashboardStoreState>((set, get) => {
  const load = async () => {
    if (!isDeviceMessageCaptureSupported()) {
      set({ status: "unsupported" });
      return;
    }
    const id = ++loadId;
    set({ progress: null });
    try {
      await syncDeviceMessages({
        onProgress: (next: SyncProgress) => {
          if (id !== loadId) return;
          set({ progress: { scanned: next.scanned, inserted: next.inserted } });
        },
      });
      if (id !== loadId) return;
      const caughtUp = await readCaughtUp();
      if (id !== loadId) return;
      set((state) => ({
        status: "ready",
        progress: null,
        caughtUpTransactions: caughtUp,
        syncRevision: state.syncRevision + 1,
      }));
    } catch (e) {
      if (id !== loadId) return;
      set({ status: "error", error: e instanceof Error ? e.message : String(e), progress: null });
    }
  };

  const checkPermissionThenLoad = () => {
    if (!deviceMessageCaptureRequiresReadPermission()) {
      void load();
      return;
    }
    hasSmsReadPermission()
      .then((granted) => {
        if (granted) {
          set({ status: "loading" });
          void load();
        } else {
          set({ status: "needs-permission" });
        }
      })
      .catch((e: unknown) => {
        set({ status: "error", error: e instanceof Error ? e.message : String(e) });
      });
  };

  const refreshCaughtUpState = async () => {
    try {
      // Resuming refreshes the caught-up batch only; it never scans the
      // inbox, and screens need no nudge — their local queries are live.
      set({ caughtUpTransactions: await readCaughtUp() });
    } catch (cause) {
      console.warn("Zeeya could not refresh caught-up transactions", cause);
    }
  };

  // A sync that ran elsewhere (real-time SMS, foreground catch-up) finished.
  const applyExternalSync = async (publicationId: number) => {
    try {
      // Resolve the durable sequence boundary before exposing the in-app
      // dialog. Otherwise a very fast dismiss could clear it while leaving
      // the same arrival unseen in SQLite, making it reappear next launch.
      const caughtUp = await readCaughtUp();
      if (publicationId !== loadId || !listeningForNewMessages) return;
      // An external sync can supersede an in-flight load() (a realtime SMS
      // during the startup scan); that load returns early, so this path must
      // also clear its progress.
      set((state) => ({
        error: null,
        status: "ready",
        progress: null,
        caughtUpTransactions: caughtUp,
        syncRevision: state.syncRevision + 1,
      }));
    } catch (cause) {
      if (publicationId !== loadId || !listeningForNewMessages) return;
      set({ status: "error", error: cause instanceof Error ? cause.message : String(cause) });
    }
  };

  const startListeningForNewMessages = () => {
    if (listeningForNewMessages) return stopListeningForNewMessages;
    listeningForNewMessages = true;

    if (!isDeviceMessageCaptureSupported()) {
      set({ status: "unsupported" });
      return stopListeningForNewMessages;
    }
    checkPermissionThenLoad();

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") void refreshCaughtUpState();
    });

    // The capability layer already synced; only the sync state needs reading.
    const messageSyncUnsubscribe = subscribeToMessageSync(() => {
      loadId += 1;
      void applyExternalSync(loadId);
    });

    unsubscribe = () => {
      appStateSubscription.remove();
      messageSyncUnsubscribe();
    };
    return stopListeningForNewMessages;
  };

  const stopListeningForNewMessages = () => {
    unsubscribe?.();
    unsubscribe = null;
    listeningForNewMessages = false;
    // Marks any sync still running as out of date, so a slow one can't
    // write its results in after we've stopped.
    loadId += 1;
  };

  return {
    status: "checking",
    error: null,
    syncRevision: 0,
    refreshing: false,
    progress: null,
    caughtUpTransactions: EMPTY_CAUGHT_UP_TRANSACTIONS,
    start: startListeningForNewMessages,
    dismissCaughtUp: async () => {
      // Acknowledge exactly the batch the user dismissed. Re-querying here
      // could advance past an SMS that arrived between render and tap,
      // permanently hiding a transaction the user never saw.
      const throughSequence = get().caughtUpTransactions.throughSequence;
      set({ caughtUpTransactions: EMPTY_CAUGHT_UP_TRANSACTIONS });
      await acknowledgeCaughtUpTransactions(throughSequence);
    },
    connect: async () => {
      set({ status: "loading" });
      try {
        // Connecting enables both the initial inbox catch-up (READ_SMS) and
        // live foreground delivery (RECEIVE_SMS). Asking only for READ_SMS
        // would leave the dashboard current at launch but deaf while open.
        const granted = await requestSmsCapturePermissions();
        if (!granted) {
          set({ status: "needs-permission" });
          return;
        }
        await load();
      } catch (e) {
        set({ status: "error", error: e instanceof Error ? e.message : String(e) });
      }
    },
    onRefresh: async () => {
      set({ refreshing: true });
      await load();
      set({ refreshing: false });
    },
  };
});
