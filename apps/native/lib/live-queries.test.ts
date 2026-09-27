import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dayListeners = new Set<() => void>();
vi.mock("./today", () => ({
  subscribeDayChanged: (listener: () => void) => {
    dayListeners.add(listener);
    return () => dayListeners.delete(listener);
  },
}));

const { notifyDataChanged } = await import("@/db/data-changes");
const { connectLiveQueries } = await import("./live-queries");

describe("connectLiveQueries", () => {
  let client: QueryClient;
  let disconnect: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    disconnect = connectLiveQueries(client);
  });
  afterEach(() => {
    disconnect();
    client.clear();
    vi.useRealTimers();
  });

  it("invalidates every local query, and only local queries, on a committed write", async () => {
    client.setQueryData(["local", "home-read-model", "INR"], 1);
    client.setQueryData(["trpc", "me"], 1);

    notifyDataChanged();
    await vi.runAllTimersAsync();

    expect(client.getQueryState(["local", "home-read-model", "INR"])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["trpc", "me"])?.isInvalidated).toBe(false);
  });

  it("invalidates local queries when the day rolls over", () => {
    client.setQueryData(["local", "insights-overview", "INR"], 1);

    for (const listener of dayListeners) listener();

    expect(client.getQueryState(["local", "insights-overview", "INR"])?.isInvalidated).toBe(true);
  });

  it("stops invalidating after disconnect", async () => {
    disconnect();
    client.setQueryData(["local", "detail", "transaction", "t1"], 1);

    notifyDataChanged();
    await vi.runAllTimersAsync();

    expect(client.getQueryState(["local", "detail", "transaction", "t1"])?.isInvalidated).toBe(
      false,
    );
    disconnect = () => undefined;
  });
});
