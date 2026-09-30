import { describe, expect, it, vi } from "vitest";

import { runPeriodicSync, syncAndNotify } from "./periodic-sync";

// An arrival log stand-in: `sync` appends `arriving` transactions, and the
// count reads how many arrived after a cursor — the same contract
// db/caught-up-transactions.ts implements over sms_arrivals.
function arrivals(existing: number, arriving: number) {
  let head = existing;
  return {
    arrivalCursor: vi.fn(async () => head),
    sync: vi.fn(async () => {
      head += arriving;
    }),
    countTransactionsArrivedAfter: vi.fn(async (cursor: number) => head - cursor),
  };
}

const enabled = async () => ({ backgroundSyncEnabled: true, transactionNotificationsEnabled: true });

describe("periodic financial sync policy", () => {
  it("does no inbox or notification work while background sync is disabled", async () => {
    const log = arrivals(3, 1);
    const canSync = vi.fn();
    const notify = vi.fn();

    const result = await runPeriodicSync({
      getSettings: async () => ({ backgroundSyncEnabled: false, transactionNotificationsEnabled: true }),
      canSync,
      ...log,
      notify,
    });

    expect(result).toEqual({ status: "disabled", newFinancialTransactions: 0 });
    expect(canSync).not.toHaveBeenCalled();
    expect(log.sync).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("does no inbox or notification work after capture permission is revoked", async () => {
    const log = arrivals(3, 1);
    const notify = vi.fn();

    const result = await runPeriodicSync({
      getSettings: enabled,
      canSync: async () => false,
      ...log,
      notify,
    });

    expect(result).toEqual({ status: "permissions-missing", newFinancialTransactions: 0 });
    expect(log.arrivalCursor).not.toHaveBeenCalled();
    expect(log.sync).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("notifies once when enabled and the sync adds financial transactions", async () => {
    const notify = vi.fn().mockResolvedValue(undefined);

    const result = await runPeriodicSync({
      getSettings: enabled,
      canSync: async () => true,
      ...arrivals(3, 1),
      notify,
    });

    expect(result).toEqual({ status: "completed", newFinancialTransactions: 1 });
    expect(notify).toHaveBeenCalledWith(1);
  });

  it("runs the after-sync step (budget alerts) only after a completed sync", async () => {
    const afterSync = vi.fn().mockResolvedValue(undefined);
    const log = arrivals(3, 1);
    await runPeriodicSync({ getSettings: enabled, canSync: async () => true, ...log, notify: vi.fn(), afterSync });
    expect(afterSync).toHaveBeenCalledTimes(1);
    expect(log.sync.mock.invocationCallOrder[0]!).toBeLessThan(afterSync.mock.invocationCallOrder[0]!);

    const skipped = vi.fn();
    await runPeriodicSync({
      getSettings: async () => ({ backgroundSyncEnabled: false, transactionNotificationsEnabled: true }),
      canSync: async () => true,
      ...arrivals(3, 1),
      notify: vi.fn(),
      afterSync: skipped,
    });
    expect(skipped).not.toHaveBeenCalled();
  });

  it("does not notify for a sync that adds no financial transaction", async () => {
    const notify = vi.fn();

    await runPeriodicSync({ getSettings: enabled, canSync: async () => true, ...arrivals(3, 0), notify });

    expect(notify).not.toHaveBeenCalled();
  });

  describe("syncAndNotify", () => {
    it("reads the cursor before syncing, so only this sync's arrivals count", async () => {
      const order: string[] = [];
      await syncAndNotify({
        arrivalCursor: async () => {
          order.push("cursor");
          return 0;
        },
        sync: async () => {
          order.push("sync");
        },
        countTransactionsArrivedAfter: async () => {
          order.push("count");
          return 0;
        },
        transactionNotificationsEnabled: true,
        notify: vi.fn(),
      });

      expect(order).toEqual(["cursor", "sync", "count"]);
    });

    it("counts new transactions but does not notify when notifications are off", async () => {
      const notify = vi.fn();

      const result = await syncAndNotify({
        ...arrivals(3, 2),
        transactionNotificationsEnabled: false,
        notify,
      });

      expect(notify).not.toHaveBeenCalled();
      expect(result.newFinancialTransactions).toBe(2);
    });

    it("coalesces a burst of several new transactions from one sync into a single notify() call", async () => {
      const notify = vi.fn().mockResolvedValue(undefined);

      const result = await syncAndNotify({
        ...arrivals(1, 3),
        transactionNotificationsEnabled: true,
        notify,
      });

      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify).toHaveBeenCalledWith(3);
      expect(result.newFinancialTransactions).toBe(3);
    });
  });
});
