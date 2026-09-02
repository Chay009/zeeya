import { describe, expect, it, vi } from "vitest";
import { createMalanaEngine } from "@zeeya/parser/malana";

import type { Dashboard } from "@/lib/dashboard";
import type { ParsedSms } from "@/lib/sms";

import { findNewFinancialTransactions, runPeriodicSync, syncAndNotify } from "./periodic-sync";

function transaction(id: string, date: number): ParsedSms {
  const body = "INR 10 debited from account XX1234";
  return {
    id,
    sender: "VM-HDFCBK",
    body,
    date,
    result: createMalanaEngine().parse(body, "VM-HDFCBK"),
  };
}

function dashboard(recent: ParsedSms[]): Dashboard {
  return {
    accounts: [],
    detectedAccounts: [],
    banks: [],
    monthIncomeByCurrency: {},
    monthExpenseByCurrency: {},
    subscriptions: [],
    mandates: [],
    mandatesByMerchant: [],
    activity: recent,
    recent,
  };
}

describe("periodic financial sync policy", () => {
  it("identifies only financial rows that were absent before the sync", () => {
    const old = transaction("old", 1);
    const added = transaction("new", 2);

    expect(findNewFinancialTransactions(dashboard([old]), dashboard([added, old]))).toEqual([
      added,
    ]);
  });

  it("does no inbox or notification work while background sync is disabled", async () => {
    const canSync = vi.fn();
    const sync = vi.fn();
    const notify = vi.fn();

    const result = await runPeriodicSync({
      getSettings: async () => ({
        backgroundSyncEnabled: false,
        transactionNotificationsEnabled: true,
      }),
      canSync,
      loadDashboard: async () => dashboard([]),
      sync,
      notify,
    });

    expect(result).toEqual({ status: "disabled", newFinancialTransactions: 0 });
    expect(sync).not.toHaveBeenCalled();
    expect(canSync).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("does no inbox or notification work after capture permission is revoked", async () => {
    const loadDashboard = vi.fn();
    const sync = vi.fn();
    const notify = vi.fn();

    const result = await runPeriodicSync({
      getSettings: async () => ({
        backgroundSyncEnabled: true,
        transactionNotificationsEnabled: true,
      }),
      canSync: async () => false,
      loadDashboard,
      sync,
      notify,
    });

    expect(result).toEqual({ status: "permissions-missing", newFinancialTransactions: 0 });
    expect(loadDashboard).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("notifies once when enabled and the sync adds recognized financial activity", async () => {
    const old = transaction("old", 1);
    const added = transaction("new", 2);
    const notify = vi.fn().mockResolvedValue(undefined);

    const result = await runPeriodicSync({
      getSettings: async () => ({
        backgroundSyncEnabled: true,
        transactionNotificationsEnabled: true,
      }),
      canSync: async () => true,
      loadDashboard: async () => dashboard([old]),
      sync: async () => dashboard([added, old]),
      notify,
    });

    expect(result).toEqual({ status: "completed", newFinancialTransactions: 1 });
    expect(notify).toHaveBeenCalledWith([added]);
  });

  it("does not notify for a sync that adds no financial transaction", async () => {
    const same = dashboard([transaction("old", 1)]);
    const notify = vi.fn();

    await runPeriodicSync({
      getSettings: async () => ({
        backgroundSyncEnabled: true,
        transactionNotificationsEnabled: true,
      }),
      canSync: async () => true,
      loadDashboard: async () => same,
      sync: async () => same,
      notify,
    });

    expect(notify).not.toHaveBeenCalled();
  });

  // syncAndNotify is the sequence both runPeriodicSync (above) and the
  // real-time SMS-broadcast path (provider.native.tsx's notifyRealtimeSync
  // — untestable directly under Vitest, since it transitively imports
  // react-native, same reason lib/sms.ts's own module can't be either)
  // share. Tested here directly, not just through runPeriodicSync's
  // gating, since the real-time caller invokes it without that gating at
  // all — its own permission/subscription checks happen upstream instead.
  describe("syncAndNotify", () => {
    it("notifies with exactly the newly-added financial transactions when enabled", async () => {
      const old = transaction("old", 1);
      const added = transaction("new", 2);
      const notify = vi.fn().mockResolvedValue(undefined);

      const result = await syncAndNotify({
        loadDashboard: async () => dashboard([old]),
        sync: async () => dashboard([added, old]),
        transactionNotificationsEnabled: true,
        notify,
      });

      expect(notify).toHaveBeenCalledWith([added]);
      expect(result.newFinancialTransactions).toEqual([added]);
      expect(result.dashboard).toEqual(dashboard([added, old]));
    });

    it("does not notify when transactionNotificationsEnabled is false, even with new activity", async () => {
      const old = transaction("old", 1);
      const added = transaction("new", 2);
      const notify = vi.fn();

      const result = await syncAndNotify({
        loadDashboard: async () => dashboard([old]),
        sync: async () => dashboard([added, old]),
        transactionNotificationsEnabled: false,
        notify,
      });

      expect(notify).not.toHaveBeenCalled();
      // The sync itself, and the diff it returns to the caller, still
      // happen regardless of the notification preference — only the
      // notify() call is gated, not the sync/diff work itself.
      expect(result.newFinancialTransactions).toEqual([added]);
    });

    it("treats a message present both before and after as not new (duplicate suppression)", async () => {
      const seen = transaction("seen", 1);
      const notify = vi.fn();

      const result = await syncAndNotify({
        loadDashboard: async () => dashboard([seen]),
        sync: async () => dashboard([seen]), // same id, re-synced
        transactionNotificationsEnabled: true,
        notify,
      });

      expect(notify).not.toHaveBeenCalled();
      expect(result.newFinancialTransactions).toEqual([]);
    });

    it("coalesces a burst of several new messages from one sync into a single notify() call", async () => {
      const old = transaction("old", 1);
      const burst = [transaction("b1", 2), transaction("b2", 3), transaction("b3", 4)];
      const notify = vi.fn().mockResolvedValue(undefined);

      const result = await syncAndNotify({
        loadDashboard: async () => dashboard([old]),
        sync: async () => dashboard([...burst, old]),
        transactionNotificationsEnabled: true,
        notify,
      });

      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify).toHaveBeenCalledWith(burst);
      expect(result.newFinancialTransactions).toEqual(burst);
    });
  });
});
