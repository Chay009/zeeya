import { describe, expect, it } from "vitest";

import type { InsightsTransactionRow } from "../insights-transaction-presentation";
import {
  createInsightsRecentTransactionsController,
  type InsightsRecentTransactionsLoader,
  type InsightsRecentTransactionsState,
} from "./insights-recent-transactions-controller";

function row(key: string): InsightsTransactionRow {
  return {
    key,
    name: "Swiggy",
    sub: "18 Sep · 10:30 am",
    amount: "-₹420",
    date: Date.UTC(2026, 8, 18, 5, 0),
    monthGroup: "September 2026",
    category: "food",
    letter: "S",
    tile: "#fff4e8",
    ink: "#f97316",
    img: null,
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

describe("createInsightsRecentTransactionsController", () => {
  it("loads five rows for the requested direction and currency", async () => {
    const pending = deferred<InsightsTransactionRow[]>();
    const queries: { direction: string; currency: string; limit: number }[] = [];
    const load: InsightsRecentTransactionsLoader = async (query) => {
      queries.push(query);
      return pending.promise;
    };
    const controller = createInsightsRecentTransactionsController({
      initialQuery: { direction: "expense", currency: "INR", limit: 5 },
      load,
    });

    controller.sync({ direction: "expense", currency: "INR", limit: 5 }, 1);
    expect(queries).toEqual([{ direction: "expense", currency: "INR", limit: 5 }]);
    expect(controller.getState()).toMatchObject({
      status: "loading",
      direction: "expense",
      currency: "INR",
      items: [],
    });

    pending.resolve([row("txn-1")]);
    await pending.promise;
    await flushAsync();
    expect(controller.getState()).toMatchObject({
      status: "ready",
      items: [row("txn-1")],
    });
  });

  it("refetches when direction, currency, or revision changes and lets the latest request win", async () => {
    const first = deferred<InsightsTransactionRow[]>();
    const second = deferred<InsightsTransactionRow[]>();
    const queries: string[] = [];
    const pending = [first, second];
    const load: InsightsRecentTransactionsLoader = async ({ direction, currency }) => {
      queries.push(`${direction}:${currency}`);
      return pending.shift()!.promise;
    };
    const controller = createInsightsRecentTransactionsController({
      initialQuery: { direction: "expense", currency: "INR", limit: 5 },
      load,
    });
    const states: InsightsRecentTransactionsState[] = [];
    controller.subscribe((state) => states.push(state));

    controller.sync({ direction: "expense", currency: "INR", limit: 5 }, 1);
    controller.sync({ direction: "income", currency: "INR", limit: 5 }, 2);
    first.resolve([row("stale")]);
    await first.promise;
    await flushAsync();
    expect(controller.getState()).toMatchObject({
      status: "loading",
      direction: "income",
      items: [],
    });

    second.resolve([row("fresh")]);
    await second.promise;
    await flushAsync();
    expect(controller.getState()).toMatchObject({
      status: "ready",
      direction: "income",
      items: [row("fresh")],
    });
    expect(queries).toEqual(["expense:INR", "income:INR"]);
  });

  it("publishes errors and ignores results after disposal", async () => {
    const pending = deferred<InsightsTransactionRow[]>();
    const controller = createInsightsRecentTransactionsController({
      initialQuery: { direction: "expense", currency: "INR", limit: 5 },
      load: async () => pending.promise,
    });

    controller.sync({ direction: "expense", currency: "INR", limit: 5 }, 0);
    controller.dispose();
    pending.resolve([row("txn-1")]);
    await pending.promise;
    await flushAsync();
    expect(controller.getState().status).toBe("loading");
  });

  it("surfaces loader failures as error state", async () => {
    const controller = createInsightsRecentTransactionsController({
      initialQuery: { direction: "expense", currency: "INR", limit: 5 },
      load: async () => {
        throw new Error("db unavailable");
      },
    });

    controller.sync({ direction: "expense", currency: "INR", limit: 5 }, 0);
    await flushAsync();
    expect(controller.getState()).toMatchObject({
      status: "error",
      error: "db unavailable",
      items: [],
    });
  });
});
