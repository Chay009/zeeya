import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CaughtUpTransactionBatch } from "@/db/caught-up-transactions";

// start() performs one process-start catch-up and subscribes to completed
// sync publications. Route visits and AppState transitions must never start
// another inbox scan. AppState may refresh SQL-backed caught-up state only.
const dependencies = vi.hoisted(() => {
  type AppStateListener = (state: string) => void;
  const appStateListeners = new Set<AppStateListener>();

  return {
    appStateListeners,
    addEventListener: vi.fn((_event: string, listener: AppStateListener) => {
      appStateListeners.add(listener);
      return { remove: () => appStateListeners.delete(listener) };
    }),
    isSupported: vi.fn(() => true),
    requiresPermission: vi.fn(() => false),
    syncDeviceMessages: vi.fn(async (): Promise<void> => undefined),
    hasSmsReadPermission: vi.fn(async () => true),
    requestSmsCapturePermissions: vi.fn(async () => true),
    queryCaughtUpTransactions: vi.fn(
      async (): Promise<CaughtUpTransactionBatch> => ({
        items: [],
        total: 0,
        throughSequence: 0,
      }),
    ),
    acknowledgeCaughtUpTransactions: vi.fn(async () => undefined),
    checkBudgetAlerts: vi.fn(async () => undefined),
  };
});

vi.mock("@/features/budgets/check-budget-alerts", () => ({
  checkBudgetAlerts: dependencies.checkBudgetAlerts,
}));

vi.mock("@/db/caught-up-transactions", () => ({
  queryCaughtUpTransactions: dependencies.queryCaughtUpTransactions,
  acknowledgeCaughtUpTransactions: dependencies.acknowledgeCaughtUpTransactions,
}));

vi.mock("react-native", () => ({
  AppState: { addEventListener: dependencies.addEventListener },
}));

vi.mock("@/lib/device-message-sync", () => ({
  isDeviceMessageCaptureSupported: dependencies.isSupported,
  deviceMessageCaptureRequiresReadPermission: dependencies.requiresPermission,
  syncDeviceMessages: dependencies.syncDeviceMessages,
}));

vi.mock("@/lib/sms", () => ({
  hasSmsReadPermission: dependencies.hasSmsReadPermission,
  requestSmsCapturePermissions: dependencies.requestSmsCapturePermissions,
}));

// The store remembers whether it already started, so each test needs its own
// copy of the module.
async function freshStore() {
  vi.resetModules();
  const [{ useDashboardStore }, { publishMessageSync }] = await Promise.all([
    import("./dashboard-store"),
    // Same import path the store uses, so publishing reaches its listener.
    import("@/features/capabilities/message-sync-events"),
  ]);
  return { useDashboardStore, publishMessageSync };
}

// Lets the store's pending promises settle before asserting.
async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function emitAppStateActive() {
  for (const listener of Array.from(dependencies.appStateListeners)) listener("active");
}

describe("dashboardStore sync lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.appStateListeners.clear();
    dependencies.isSupported.mockReturnValue(true);
    dependencies.requiresPermission.mockReturnValue(false);
    dependencies.syncDeviceMessages.mockImplementation(async () => undefined);
    dependencies.queryCaughtUpTransactions.mockResolvedValue({
      items: [],
      total: 0,
      throughSequence: 0,
    });
  });

  it("requests both read and receive permissions when connecting", async () => {
    dependencies.requiresPermission.mockReturnValue(true);
    dependencies.hasSmsReadPermission.mockResolvedValue(false);
    const { useDashboardStore } = await freshStore();

    await useDashboardStore.getState().connect();

    expect(dependencies.requestSmsCapturePermissions).toHaveBeenCalledTimes(1);
    expect(dependencies.syncDeviceMessages).toHaveBeenCalledTimes(1);
  });

  it("performs one startup catch-up and only refreshes SQL state on AppState resume", async () => {
    const { useDashboardStore } = await freshStore();

    useDashboardStore.getState().start();
    useDashboardStore.getState().start();
    useDashboardStore.getState().start();
    await flush();

    expect(dependencies.addEventListener).toHaveBeenCalledTimes(1);
    expect(dependencies.appStateListeners.size).toBe(1);
    expect(dependencies.syncDeviceMessages).toHaveBeenCalledTimes(1);
    const caughtUpReadsBeforeResume = dependencies.queryCaughtUpTransactions.mock.calls.length;

    emitAppStateActive();
    await flush();
    expect(dependencies.syncDeviceMessages).toHaveBeenCalledTimes(1);
    expect(dependencies.queryCaughtUpTransactions).toHaveBeenCalledTimes(
      caughtUpReadsBeforeResume + 1,
    );
  });

  it("stops picking up new messages after start()'s stop function runs", async () => {
    const { useDashboardStore, publishMessageSync } = await freshStore();

    const stop = useDashboardStore.getState().start();
    await flush();
    const syncCallsBeforeStop = dependencies.syncDeviceMessages.mock.calls.length;

    stop();
    expect(dependencies.appStateListeners.size).toBe(0);

    emitAppStateActive();
    await flush();
    expect(dependencies.syncDeviceMessages).toHaveBeenCalledTimes(syncCallsBeforeStop);

    // New messages should no longer reach the store either.
    useDashboardStore.setState({ status: "checking" });
    publishMessageSync();
    await flush();
    expect(useDashboardStore.getState().status).toBe("checking");
  });

  it("picks up new messages again after being stopped and restarted", async () => {
    const { useDashboardStore, publishMessageSync } = await freshStore();

    const stop = useDashboardStore.getState().start();
    await flush();
    stop();

    useDashboardStore.getState().start();
    await flush();

    // A genuine second publication subscription, without adding an
    // AppState-driven inbox scan.
    expect(dependencies.addEventListener).toHaveBeenCalledTimes(2);
    expect(dependencies.appStateListeners.size).toBe(1);

    useDashboardStore.setState({ status: "checking" });
    publishMessageSync();
    await flush();
    expect(useDashboardStore.getState().status).toBe("ready");
  });

  it("ignores a sync that finishes after being stopped", async () => {
    const { useDashboardStore } = await freshStore();

    let releaseSync: (() => void) | null = null;
    dependencies.syncDeviceMessages.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseSync = resolve;
      });
    });

    const stop = useDashboardStore.getState().start();
    await flush();
    expect(releaseSync).not.toBeNull();

    // Stop while that sync is still pending, then let it land.
    stop();
    useDashboardStore.setState({ status: "checking" });
    releaseSync!();
    await flush();

    // The late result counts as out of date, so it can't flip the store to
    // "ready" after we stopped.
    expect(useDashboardStore.getState().status).toBe("checking");
  });

  // syncRevision's remaining reader (settings account counts) keys its reload
  // on it, so every completed sync — initial load and each later
  // publishMessageSync() push — must bump it, not just the first.
  it("bumps syncRevision on the initial load and again on every later message-sync push, even with nothing else changing", async () => {
    const { useDashboardStore, publishMessageSync } = await freshStore();

    expect(useDashboardStore.getState().syncRevision).toBe(0);

    useDashboardStore.getState().start();
    await flush();
    const afterInitialLoad = useDashboardStore.getState().syncRevision;
    expect(afterInitialLoad).toBeGreaterThan(0);

    // Simulates a foreground/pull-to-refresh sync that republishes a
    // projection with no change to currency or direction — exactly the
    // case that used to leave Insights' charts stale.
    publishMessageSync();
    await flush();
    expect(useDashboardStore.getState().syncRevision).toBeGreaterThan(afterInitialLoad);

    const afterSecondPush = useDashboardStore.getState().syncRevision;
    publishMessageSync();
    await flush();
    expect(useDashboardStore.getState().syncRevision).toBeGreaterThan(afterSecondPush);
  });

  it("checks budget alerts after each completed sync, not on a plain resume", async () => {
    const { useDashboardStore, publishMessageSync } = await freshStore();

    useDashboardStore.getState().start();
    await flush();
    expect(dependencies.checkBudgetAlerts).toHaveBeenCalledTimes(1);

    publishMessageSync();
    await flush();
    expect(dependencies.checkBudgetAlerts).toHaveBeenCalledTimes(2);

    emitAppStateActive();
    await flush();
    expect(dependencies.checkBudgetAlerts).toHaveBeenCalledTimes(2);
  });

  it("does not check budget alerts when the sync fails", async () => {
    dependencies.syncDeviceMessages.mockRejectedValueOnce(new Error("inbox unavailable"));
    const { useDashboardStore } = await freshStore();

    useDashboardStore.getState().start();
    await flush();

    expect(useDashboardStore.getState().status).toBe("error");
    expect(dependencies.checkBudgetAlerts).not.toHaveBeenCalled();
  });

  it("loads the durable caught-up batch before startup becomes ready and acknowledges it on dismiss", async () => {
    const caughtUp = {
      items: [
        {
          id: "new-while-away",
          date: 1,
          amountMinorUnits: 100,
          currency: "INR",
          direction: "expense" as const,
          accountId: null,
          trxTypeRich: "EXPENSE",
          vendor: "Shop",
          brandName: null,
          category: "Shopping",
          ref: null,
          bankName: null,
          mandateId: null,
        },
      ],
      total: 1,
      throughSequence: 7,
    };
    dependencies.queryCaughtUpTransactions.mockResolvedValue(caughtUp);
    const { useDashboardStore } = await freshStore();

    useDashboardStore.getState().start();
    await flush();
    expect(useDashboardStore.getState().status).toBe("ready");
    expect(useDashboardStore.getState().caughtUpTransactions).toEqual(caughtUp);

    dependencies.queryCaughtUpTransactions.mockResolvedValue({
      items: [],
      total: 0,
      throughSequence: 12,
    });
    await useDashboardStore.getState().dismissCaughtUp();
    // A newer arrival racing with the dismiss was not part of the rendered
    // batch and must remain unseen for the next refresh.
    expect(dependencies.acknowledgeCaughtUpTransactions).toHaveBeenCalledWith(7);
    expect(dependencies.queryCaughtUpTransactions).toHaveBeenCalledTimes(1);
    expect(useDashboardStore.getState().caughtUpTransactions.items).toEqual([]);
  });

  it("attaches the durable arrival boundary before publishing a foreground update", async () => {
    const { useDashboardStore, publishMessageSync } = await freshStore();
    useDashboardStore.getState().start();
    await flush();

    dependencies.queryCaughtUpTransactions.mockResolvedValue({
      items: [],
      total: 1,
      throughSequence: 9,
    });
    publishMessageSync();
    await flush();

    expect(useDashboardStore.getState().caughtUpTransactions.throughSequence).toBe(9);
    await useDashboardStore.getState().dismissCaughtUp();
    expect(dependencies.acknowledgeCaughtUpTransactions).toHaveBeenLastCalledWith(9);
  });

  // Regression: pull-to-refresh used to overwrite the unseen batch with an
  // empty one, so transactions a refresh brought in never reached the dialog.
  it("reads the unseen batch after a pull-to-refresh instead of clearing it", async () => {
    const { useDashboardStore } = await freshStore();
    useDashboardStore.getState().start();
    await flush();

    dependencies.queryCaughtUpTransactions.mockResolvedValue({
      items: [],
      total: 2,
      throughSequence: 15,
    });
    await useDashboardStore.getState().onRefresh();

    expect(useDashboardStore.getState().caughtUpTransactions).toMatchObject({
      total: 2,
      throughSequence: 15,
    });
    expect(useDashboardStore.getState().refreshing).toBe(false);
  });
});
