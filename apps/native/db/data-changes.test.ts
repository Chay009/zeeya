import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { notifyDataChanged, subscribeDataChanged } from "./data-changes";

describe("data-changes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces a burst of notifications into one callback", () => {
    const listener = vi.fn();
    const off = subscribeDataChanged(listener);

    notifyDataChanged();
    notifyDataChanged();
    notifyDataChanged();
    expect(listener).not.toHaveBeenCalled(); // never inside the writer's stack

    vi.runAllTimers();
    expect(listener).toHaveBeenCalledTimes(1);

    notifyDataChanged();
    vi.runAllTimers();
    expect(listener).toHaveBeenCalledTimes(2);
    off();
  });

  it("stops delivering after unsubscribe and isolates a throwing listener", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const throwing = vi.fn(() => {
      throw new Error("boom");
    });
    const healthy = vi.fn();
    const offThrowing = subscribeDataChanged(throwing);
    const offHealthy = subscribeDataChanged(healthy);

    notifyDataChanged();
    vi.runAllTimers();
    expect(healthy).toHaveBeenCalledTimes(1);

    offHealthy();
    notifyDataChanged();
    vi.runAllTimers();
    expect(healthy).toHaveBeenCalledTimes(1);

    offThrowing();
    errorSpy.mockRestore();
  });
});
