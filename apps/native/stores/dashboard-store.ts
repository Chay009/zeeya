import { AppState } from "react-native";
import { create } from "zustand";

import {
  acknowledgeCaughtUpTransactions,
  queryCaughtUpTransactions,
  type CaughtUpTransactionBatch,
} from "@/db/caught-up-transactions";
import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import type { DashboardAggregates } from "@/lib/dashboard-data";
import { deriveDashboard, type Dashboard } from "@/lib/dashboard";
import { primaryFirstCurrencies } from "@/lib/currency-preference";
import {
  deviceMessageCaptureRequiresReadPermission,
  isDeviceMessageCaptureSupported,
  syncDeviceMessages,
} from "@/lib/device-message-sync";
import type { SyncProgress } from "@/db/sync";
import { hasSmsReadPermission, requestSmsCapturePermissions } from "@/lib/sms";
import { subscribeToMessageSync } from "@/features/capabilities/message-sync-events";
import {
  applyDashboardUpdate,
  dismissNewSinceLastView as dismissNewSinceLastViewState,
  initialNewSinceLastViewState,
  type NewSinceLastViewState,
} from "@/features/dashboard/hooks/new-since-last-view";
import type { ParsedSms } from "@/lib/sms";

export type DashboardSyncStatus =
  | "checking"
  | "needs-permission"
  | "loading"
  | "ready"
  | "unsupported"
  | "error";

interface DashboardStoreState {
  status: DashboardSyncStatus;
  error: string | null;
  dashboard: Dashboard;
  aggregates: DashboardAggregates | null;
  aggregatesStatus: "idle" | "loading" | "ready" | "error";
  // Bumped every time a freshly-synced Dashboard is applied (initial load
  // or a later message-sync push) — independent of currency/direction/tab,
  // so a screen reading bounded SQL query results (e.g. Insights' series
  // queries) can add this to its own fetch dependencies and reissue those
  // queries after a same-currency refresh publishes a new projection,
  // instead of only re-querying when its own UI selection changes.
  syncRevision: number;
  refreshing: boolean;
  progress: { scanned: number; inserted: number } | null;
  newSinceLastView: ParsedSms[];
  caughtUpTransactions: CaughtUpTransactionBatch;
  // Starts picking up new SMS as they arrive. Safe to call more than once.
  // Returns the function that stops it.
  start: () => () => void;
  dismissNewSinceLastView: () => Promise<void>;
  connect: () => Promise<void>;
  onRefresh: () => Promise<void>;
}

const initialSyncState: NewSinceLastViewState = initialNewSinceLastViewState(deriveDashboard([]));

// Bumped on every load, so a slow read that finishes late can't overwrite a
// newer one's result.
let loadId = 0;
let aggregateLoadId = 0;
let syncState: NewSinceLastViewState = initialSyncState;
let listeningForNewMessages = false;
let unsubscribe: (() => void) | null = null;
const EMPTY_CAUGHT_UP_TRANSACTIONS: CaughtUpTransactionBatch = {
  items: [],
  total: 0,
  throughSequence: 0,
};

// dashboard.recent used to be scanned here purely to collect currency
// codes — that meant the *entire* message history was walked on every
// sync just to answer "which currencies exist." monthIncome/ExpenseByCurrency
// and accounts already give the currencies with visible activity or a
// confirmed account; queryDistinctCurrencies (a one-line SQL query, no
// retention) fills in anything projected but not yet reflected in either,
// e.g. right after a first sync before deriveDashboard's own totals catch up.
async function dashboardCurrencies(dashboard: Dashboard): Promise<string[]> {
  const known = new Set([
    ...Object.keys(dashboard.monthIncomeByCurrency),
    ...Object.keys(dashboard.monthExpenseByCurrency),
    ...dashboard.accounts.map((account) => account.currency),
  ]);
  let projected: string[] = [];
  try {
    projected = await financeDataSource.dashboard.listCurrencies();
    for (const currency of projected) {
      known.add(currency);
    }
  } catch (cause) {
    // Aggregates still work for whatever currencies were already known —
    // this is a best-effort widening of the query, not load-bearing.
    console.error("Zeeya failed to list projected currencies", cause);
  }
  const latestAccount = dashboard.accounts.reduce<Dashboard["accounts"][number] | null>(
    (latest, account) => (!latest || account.asOf > latest.asOf ? account : latest),
    null,
  );
  const primary = known.has("INR") ? "INR" : (latestAccount?.currency ?? projected[0]);
  return primaryFirstCurrencies([...projected, ...known], primary);
}

export const useDashboardStore = create<DashboardStoreState>((set, get) => {
  const applyDashboard = (next: Dashboard, options: { completesFirstLoad?: boolean } = {}) => {
    syncState = applyDashboardUpdate(syncState, next, options);
    set((state) => ({
      dashboard: syncState.dashboard,
      newSinceLastView: syncState.newSinceLastView,
      aggregates: null,
      aggregatesStatus: "loading",
      syncRevision: state.syncRevision + 1,
    }));
  };

  const refreshAggregates = async (nextDashboard: Dashboard) => {
    const requestId = ++aggregateLoadId;
    try {
      const now = new Date();
      const currencies = await dashboardCurrencies(nextDashboard);
      if (requestId !== aggregateLoadId) return;
      const aggregates = await financeDataSource.dashboard.loadAggregates({
        currencies,
        at: now.getTime(),
      });
      if (requestId !== aggregateLoadId) return;
      set({ aggregates, aggregatesStatus: "ready" });
    } catch (cause) {
      if (requestId !== aggregateLoadId) return;
      console.error("Zeeya dashboard aggregates failed to load", cause);
      set({ aggregates: null, aggregatesStatus: "error" });
    }
  };

  const load = async (options: { startup?: boolean } = {}) => {
    if (!isDeviceMessageCaptureSupported()) {
      set({ status: "unsupported" });
      return;
    }
    const id = ++loadId;
    set({ progress: null });
    try {
      const nextDashboard = await syncDeviceMessages({
        currentDashboard: get().status === "ready" ? get().dashboard : undefined,
        onProgress: (next: SyncProgress) => {
          if (id !== loadId) return;
          set({ progress: { scanned: next.scanned, inserted: next.inserted } });
        },
      });
      if (id !== loadId) return;
      let caughtUp = EMPTY_CAUGHT_UP_TRANSACTIONS;
      if (options.startup) {
        caughtUp = await queryCaughtUpTransactions({ limit: 8 });
        if (caughtUp.total === 0 && caughtUp.throughSequence > 0) {
          await acknowledgeCaughtUpTransactions(caughtUp.throughSequence);
        }
      }
      if (id !== loadId) return;
      applyDashboard(nextDashboard, { completesFirstLoad: true });
      set({ status: "ready", progress: null, caughtUpTransactions: caughtUp });
      void refreshAggregates(nextDashboard);
    } catch (e) {
      if (id !== loadId) return;
      set({ status: "error", error: e instanceof Error ? e.message : String(e), progress: null });
    }
  };

  const checkPermissionThenLoad = () => {
    if (!deviceMessageCaptureRequiresReadPermission()) {
      void load({ startup: true });
      return;
    }
    hasSmsReadPermission()
      .then((granted) => {
        if (granted) {
          set({ status: "loading" });
          void load({ startup: true });
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
      const caughtUp = await queryCaughtUpTransactions({ limit: 8 });
      if (caughtUp.total === 0 && caughtUp.throughSequence > 0) {
        await acknowledgeCaughtUpTransactions(caughtUp.throughSequence);
      }
      set((state) => ({
        caughtUpTransactions: caughtUp,
        // SQL-backed Home/Insights hooks use this revision as their reload
        // signal. Resuming refreshes projection reads only; it never scans
        // the inbox.
        syncRevision: state.syncRevision + 1,
      }));
    } catch (cause) {
      console.warn("Zeeya could not refresh caught-up transactions", cause);
    }
  };

  const applyPublishedDashboard = async (nextDashboard: Dashboard, publicationId: number) => {
    try {
      // Resolve the durable sequence boundary before exposing the in-app
      // dialog. Otherwise a very fast dismiss could clear the visual diff
      // while leaving the same arrival unseen in SQLite, making it reappear
      // on the next launch.
      const caughtUp = await queryCaughtUpTransactions({ limit: 8 });
      if (publicationId !== loadId || !listeningForNewMessages) return;
      if (caughtUp.total === 0 && caughtUp.throughSequence > 0) {
        await acknowledgeCaughtUpTransactions(caughtUp.throughSequence);
      }
      if (publicationId !== loadId || !listeningForNewMessages) return;
      applyDashboard(nextDashboard, { completesFirstLoad: true });
      set({ error: null, status: "ready", caughtUpTransactions: caughtUp });
      void refreshAggregates(nextDashboard);
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

    // The app-root sync already derived this dashboard, so reuse it instead
    // of reading the whole inbox again.
    const messageSyncUnsubscribe = subscribeToMessageSync((nextDashboard) => {
      loadId += 1;
      void applyPublishedDashboard(nextDashboard, loadId);
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
    aggregateLoadId += 1;
  };

  return {
    status: "checking",
    error: null,
    dashboard: syncState.dashboard,
    aggregates: null,
    aggregatesStatus: "idle",
    syncRevision: 0,
    refreshing: false,
    progress: null,
    newSinceLastView: syncState.newSinceLastView,
    caughtUpTransactions: EMPTY_CAUGHT_UP_TRANSACTIONS,
    start: startListeningForNewMessages,
    dismissNewSinceLastView: async () => {
      // Acknowledge exactly the batch the user dismissed. Re-querying here
      // could advance past an SMS that arrived between render and tap,
      // permanently hiding a transaction the user never saw.
      const throughSequence = get().caughtUpTransactions.throughSequence;
      syncState = dismissNewSinceLastViewState(syncState);
      set({
        newSinceLastView: syncState.newSinceLastView,
        caughtUpTransactions: EMPTY_CAUGHT_UP_TRANSACTIONS,
      });
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
        await load({ startup: true });
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
