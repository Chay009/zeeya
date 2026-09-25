import { describe, expect, it } from "vitest";

import type { HomeReadModel } from "@/lib/dashboard-data";
import {
  createHomeReadModelController,
  type HomeReadModelLoader,
  type HomeReadModelState,
} from "./home-read-model-controller";

function model(currency: string): HomeReadModel {
  return {
    currency,
    accounts: [],
    detectedAccounts: [],
    unassignedReadings: [],
    monthTotals: { incomeByCurrency: {}, expenseByCurrency: {} },
    categoryTotalsByCurrency: {},
    availableCurrencies: [currency],
    flowDays: [],
    calendarMonths: { items: [], nextCursor: null },
    subscriptionOverview: {
      items: [],
      totalsByCurrency: {},
      activeCount: 0,
      cancelledCount: 0,
    },
    recentActivity: [],
    activityCategoryCounts: [],
    totalActivityCount: 0,
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

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("createHomeReadModelController", () => {
  it("starts the initial load and publishes its result", async () => {
    const first = deferred<HomeReadModel>();
    const requests: string[] = [];
    const load: HomeReadModelLoader = async ({ currency }) => {
      requests.push(currency);
      return first.promise;
    };
    const controller = createHomeReadModelController({
      initialCurrency: "INR",
      load,
      now: () => 123,
    });
    const states: HomeReadModelState[] = [];
    controller.subscribe((state) => states.push(state));

    controller.sync(0);
    expect(requests).toEqual(["INR"]);
    expect(controller.getState()).toMatchObject({ status: "loading", currency: "INR" });

    first.resolve(model("INR"));
    await first.promise;
    await flushAsync();

    expect(controller.getState()).toMatchObject({
      status: "ready",
      currency: "INR",
      model: model("INR"),
    });
    expect(states.at(-1)?.status).toBe("ready");
  });

  it("reloads even when the requested currency is already loaded", async () => {
    const first = deferred<HomeReadModel>();
    const second = deferred<HomeReadModel>();
    const requests: string[] = [];
    const pending = [first, second];
    const load: HomeReadModelLoader = async ({ currency }) => {
      requests.push(currency);
      return pending.shift()!.promise;
    };
    const controller = createHomeReadModelController({ initialCurrency: "INR", load });
    controller.sync(0);
    first.resolve(model("INR"));
    await first.promise;
    await flushAsync();

    controller.reload("INR");
    expect(requests).toEqual(["INR", "INR"]);
    expect(controller.getState()).toMatchObject({
      status: "loading",
      currency: "INR",
      model: model("INR"),
    });

    second.resolve(model("INR"));
    await second.promise;
    await flushAsync();
    expect(controller.getState()).toMatchObject({ status: "ready", currency: "INR" });
  });

  it("reloads with a different currency and scopes the resulting state to it", async () => {
    const first = deferred<HomeReadModel>();
    const second = deferred<HomeReadModel>();
    const requests: string[] = [];
    const pending = [first, second];
    const load: HomeReadModelLoader = async ({ currency }) => {
      requests.push(currency);
      return pending.shift()!.promise;
    };
    const controller = createHomeReadModelController({ initialCurrency: "INR", load });
    controller.sync(0);
    first.resolve(model("INR"));
    await first.promise;
    await flushAsync();

    controller.reload("USD");
    expect(requests).toEqual(["INR", "USD"]);
    expect(controller.getState()).toMatchObject({
      status: "loading",
      currency: "USD",
      model: model("INR"),
    });

    second.resolve(model("USD"));
    await second.promise;
    await flushAsync();
    expect(controller.getState()).toMatchObject({
      status: "ready",
      currency: "USD",
      model: model("USD"),
    });
  });

  it("refreshes the active currency after a new sync revision", async () => {
    const first = deferred<HomeReadModel>();
    const second = deferred<HomeReadModel>();
    const requests: string[] = [];
    const pending = [first, second];
    const load: HomeReadModelLoader = async ({ currency }) => {
      requests.push(currency);
      return pending.shift()!.promise;
    };
    const controller = createHomeReadModelController({ initialCurrency: "USD", load });

    controller.sync(4);
    first.resolve(model("USD"));
    await first.promise;
    await flushAsync();

    controller.sync(4);
    expect(requests).toEqual(["USD"]);
    controller.sync(5);
    expect(requests).toEqual(["USD", "USD"]);

    second.resolve(model("USD"));
    await second.promise;
    await flushAsync();
    expect(controller.getState()).toMatchObject({ status: "ready", currency: "USD" });
  });

  it("lets only the latest overlapping request publish a result", async () => {
    const first = deferred<HomeReadModel>();
    const second = deferred<HomeReadModel>();
    const requests: string[] = [];
    const pending = [first, second];
    const load: HomeReadModelLoader = async ({ currency }) => {
      requests.push(currency);
      return pending.shift()!.promise;
    };
    const controller = createHomeReadModelController({ initialCurrency: "INR", load });
    controller.sync(0);
    controller.reload("USD");

    first.resolve(model("INR"));
    await first.promise;
    await flushAsync();
    expect(controller.getState()).toMatchObject({
      status: "loading",
      currency: "USD",
      model: null,
    });

    second.resolve(model("USD"));
    await second.promise;
    await flushAsync();
    expect(controller.getState()).toMatchObject({
      status: "ready",
      currency: "USD",
      model: model("USD"),
    });
    expect(requests).toEqual(["INR", "USD"]);
  });
});
