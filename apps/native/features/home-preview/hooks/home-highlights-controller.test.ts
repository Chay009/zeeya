import { describe, expect, it } from "vitest";

import type { HomeHighlights } from "@/lib/dashboard-data";

import {
  createHomeHighlightsController,
  type HomeHighlightsLoader,
} from "./home-highlights-controller";

function highlights(currency: string): HomeHighlights {
  return {
    currency,
    today: {
      incomeMinorUnits: 2_000,
      spendingMinorUnits: 500,
      netMinorUnits: 1_500,
      transactionCount: 1,
      recent: [],
      largestTransaction: null,
    },
    subscriptions: {
      activeCount: 1,
      likelyCount: 1,
      expectedMonthlyMinorUnits: 500,
      spentThisMonthMinorUnits: 500,
      nextPayment: null,
    },
    upcomingPaymentCount: 0,
    upcomingPaymentsTotalMinorUnits: 0,
    upcomingPayments: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("createHomeHighlightsController", () => {
  it("loads the SQL highlight query on first sync", async () => {
    const pending = deferred<HomeHighlights>();
    const queries: { currency: string; at: number }[] = [];
    const load: HomeHighlightsLoader = async (query) => {
      queries.push(query);
      return pending.promise;
    };
    const controller = createHomeHighlightsController({
      initialQuery: { currency: "INR", at: 1000 },
      load,
    });

    controller.sync({ currency: "INR", at: 1000 }, 3);
    expect(queries).toEqual([{ currency: "INR", at: 1000 }]);
    pending.resolve(highlights("INR"));
    await pending.promise;
    await flushAsync();

    expect(controller.getState()).toMatchObject({
      status: "ready",
      currency: "INR",
      highlights: highlights("INR"),
    });
  });

  it("refreshes on revision and ignores stale overlapping results", async () => {
    const first = deferred<HomeHighlights>();
    const second = deferred<HomeHighlights>();
    const pending = [first, second];
    const requests: string[] = [];
    const load: HomeHighlightsLoader = async ({ currency }) => {
      requests.push(currency);
      return pending.shift()!.promise;
    };
    const controller = createHomeHighlightsController({
      initialQuery: { currency: "INR", at: 1000 },
      load,
    });

    controller.sync({ currency: "INR", at: 1000 }, 1);
    controller.sync({ currency: "USD", at: 1001 }, 2);
    first.resolve(highlights("INR"));
    await first.promise;
    await flushAsync();
    expect(controller.getState()).toMatchObject({ status: "loading", currency: "USD" });

    second.resolve(highlights("USD"));
    await second.promise;
    await flushAsync();
    expect(controller.getState()).toMatchObject({
      status: "ready",
      currency: "USD",
      highlights: highlights("USD"),
    });
    expect(requests).toEqual(["INR", "USD"]);
  });

  it("surfaces loader failures with an actionable state", async () => {
    const controller = createHomeHighlightsController({
      initialQuery: { currency: "INR", at: 1000 },
      load: async () => {
        throw new Error("offline");
      },
    });
    controller.sync({ currency: "INR", at: 1000 }, 0);
    await flushAsync();
    expect(controller.getState()).toMatchObject({ status: "error", error: "offline" });
  });

  it("does not duplicate a reload issued before the first sync", async () => {
    const pending = deferred<HomeHighlights>();
    let calls = 0;
    const controller = createHomeHighlightsController({
      initialQuery: { currency: "INR", at: 1000 },
      load: async () => {
        calls++;
        return pending.promise;
      },
    });
    controller.reload({ currency: "INR", at: 1000 });
    controller.sync({ currency: "INR", at: 1000 }, 4);
    expect(calls).toBe(1);
    pending.resolve(highlights("INR"));
  });
});
