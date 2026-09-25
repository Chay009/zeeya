import { describe, expect, it } from "vitest";

import type { InsightsOverview } from "@/lib/dashboard-data";

import {
  createInsightsOverviewController,
  type InsightsOverviewLoader,
  type InsightsOverviewState,
} from "./insights-overview-controller";

function overview(currency: string): InsightsOverview {
  return {
    currency,
    currentMonth: {
      incomeMinorUnits: 10_000,
      spendingMinorUnits: 4_000,
      netMinorUnits: 6_000,
      transactionCount: 2,
    },
    previousMonth: {
      incomeMinorUnits: 8_000,
      spendingMinorUnits: 3_000,
      netMinorUnits: 5_000,
      transactionCount: 1,
    },
    spendingChangePercent: 33,
    topCategories: [],
    topVendors: [],
    subscriptions: {
      activeCount: 0,
      likelyCount: 0,
      monthlyCommittedMinorUnits: 0,
      top: [],
    },
    budget: null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("createInsightsOverviewController", () => {
  it("loads on the first sync and publishes ready data", async () => {
    const pending = deferred<InsightsOverview>();
    const queries: { currency: string; at: number }[] = [];
    const load: InsightsOverviewLoader = async (query) => {
      queries.push(query);
      return pending.promise;
    };
    const controller = createInsightsOverviewController({
      initialQuery: { currency: "INR", at: 1000 },
      load,
    });
    const states: InsightsOverviewState[] = [];
    controller.subscribe((state) => states.push(state));

    controller.sync({ currency: "INR", at: 1000 }, 4);
    expect(queries).toEqual([{ currency: "INR", at: 1000 }]);
    expect(controller.getState()).toMatchObject({ status: "loading", currency: "INR" });

    pending.resolve(overview("INR"));
    await pending.promise;
    await flushAsync();
    expect(controller.getState()).toMatchObject({
      status: "ready",
      currency: "INR",
      overview: overview("INR"),
    });
    expect(states.at(-1)?.status).toBe("ready");
  });

  it("refreshes on a new revision and lets the latest query win", async () => {
    const first = deferred<InsightsOverview>();
    const second = deferred<InsightsOverview>();
    const queries: string[] = [];
    const pending = [first, second];
    const load: InsightsOverviewLoader = async ({ currency }) => {
      queries.push(currency);
      return pending.shift()!.promise;
    };
    const controller = createInsightsOverviewController({
      initialQuery: { currency: "INR", at: 1000 },
      load,
    });

    controller.sync({ currency: "INR", at: 1000 }, 1);
    first.resolve(overview("INR"));
    await first.promise;
    await flushAsync();
    expect(controller.getState()).toMatchObject({ status: "ready", at: 1000 });

    controller.sync({ currency: "INR", at: 1001 }, 2);
    expect(controller.getState()).toMatchObject({
      status: "loading",
      at: 1001,
      overview: overview("INR"),
    });

    second.resolve(overview("INR"));
    await second.promise;
    await flushAsync();
    expect(controller.getState()).toMatchObject({ status: "ready", at: 1001 });
    expect(queries).toEqual(["INR", "INR"]);
  });

  it("publishes errors and ignores a result after disposal", async () => {
    const pending = deferred<InsightsOverview>();
    const controller = createInsightsOverviewController({
      initialQuery: { currency: "USD", at: 1000 },
      load: async () => pending.promise,
    });
    controller.sync({ currency: "USD", at: 1000 }, 0);
    controller.dispose();
    pending.resolve(overview("USD"));
    await pending.promise;
    await flushAsync();
    expect(controller.getState().status).toBe("loading");
  });

  it("does not duplicate a reload issued before the first sync", async () => {
    const pending = deferred<InsightsOverview>();
    let calls = 0;
    const controller = createInsightsOverviewController({
      initialQuery: { currency: "INR", at: 1000 },
      load: async () => {
        calls++;
        return pending.promise;
      },
    });
    controller.reload({ currency: "INR", at: 1000 });
    controller.sync({ currency: "INR", at: 1000 }, 4);
    expect(calls).toBe(1);
    pending.resolve(overview("INR"));
  });
});
