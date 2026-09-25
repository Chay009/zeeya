import { describe, expect, it } from "vitest";

import {
  createDashboardCurrenciesController,
  type DashboardCurrenciesLoader,
} from "./dashboard-currencies-controller";

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

describe("createDashboardCurrenciesController", () => {
  it("normalizes without replacing the source's intentional primary-first order", async () => {
    const pending = deferred<string[]>();
    const controller = createDashboardCurrenciesController({
      load: async () => pending.promise,
    });
    controller.sync(1);
    pending.resolve(["SEK", "INR", "SEK", " EUR "]);
    await pending.promise;
    await flushAsync();
    expect(controller.getState()).toMatchObject({
      status: "ready",
      currencies: ["SEK", "INR", "EUR"],
    });
  });

  it("reloads on a new revision and keeps the latest request", async () => {
    const first = deferred<string[]>();
    const second = deferred<string[]>();
    const pending = [first, second];
    const requests: number[] = [];
    const load: DashboardCurrenciesLoader = async () => {
      requests.push(requests.length);
      return pending.shift()!.promise;
    };
    const controller = createDashboardCurrenciesController({ load });
    controller.sync(1);
    controller.sync(2);
    first.resolve(["INR"]);
    await first.promise;
    await flushAsync();
    expect(controller.getState().status).toBe("loading");
    second.resolve(["USD"]);
    await second.promise;
    await flushAsync();
    expect(controller.getState()).toMatchObject({ status: "ready", currencies: ["USD"] });
    expect(requests).toEqual([0, 1]);
  });

  it("does not duplicate a reload issued before the first sync", async () => {
    const pending = deferred<string[]>();
    let calls = 0;
    const controller = createDashboardCurrenciesController({
      load: async () => {
        calls++;
        return pending.promise;
      },
    });
    controller.reload();
    controller.sync(4);
    expect(calls).toBe(1);
    pending.resolve(["INR"]);
  });
});
