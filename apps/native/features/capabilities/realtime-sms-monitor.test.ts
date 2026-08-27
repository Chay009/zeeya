import { afterEach, describe, expect, it, vi } from "vitest";

import { startRealtimeSmsMonitoring, type RealtimeSmsSignalSource } from "./realtime-sms-monitor";

function createSource(
  pending: { generation: number; count: number; lastReceivedAt: number } | null = null,
) {
  let generation = pending?.generation ?? 0;
  let listener:
    | ((signal: { generation: number; count: number; lastReceivedAt: number }) => void)
    | null = null;
  const source: RealtimeSmsSignalSource = {
    peekPendingSmsSignal: vi.fn(async () => pending),
    acknowledgePendingSmsSignal: vi.fn(async () => undefined),
    addSmsReceivedListener(next) {
      listener = next;
      return { remove: () => (listener = null) };
    },
  };
  return {
    source,
    emit: () => listener?.({ generation: ++generation, count: 1, lastReceivedAt: Date.now() }),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("real-time SMS monitoring", () => {
  it("runs the shared message sync when Android reports a newly received SMS", async () => {
    vi.useFakeTimers();
    const { source, emit } = createSource();
    const sync = vi.fn(async () => undefined);
    const stop = startRealtimeSmsMonitoring({ source, sync, delayMs: 1_000 });

    await vi.runAllTimersAsync();
    emit();
    expect(sync).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(sync).toHaveBeenCalledTimes(1);

    stop();
  });

  it("coalesces a multipart or burst delivery into one inbox synchronization", async () => {
    vi.useFakeTimers();
    const { source, emit } = createSource();
    const sync = vi.fn(async () => undefined);
    const stop = startRealtimeSmsMonitoring({ source, sync, delayMs: 1_000 });

    await Promise.resolve();
    emit();
    await vi.advanceTimersByTimeAsync(300);
    emit();
    await vi.advanceTimersByTimeAsync(300);
    emit();
    await vi.advanceTimersByTimeAsync(999);
    expect(sync).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(sync).toHaveBeenCalledTimes(1);

    stop();
  });

  it("acknowledges a durable signal only after synchronization succeeds", async () => {
    vi.useFakeTimers();
    const { source } = createSource({ generation: 7, count: 2, lastReceivedAt: 123_456 });
    const sync = vi.fn(async () => undefined);
    const stop = startRealtimeSmsMonitoring({ source, sync, delayMs: 1_000 });

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(source.acknowledgePendingSmsSignal).toHaveBeenCalledWith({
      count: 2,
      generation: 7,
      lastReceivedAt: 123_456,
    });

    stop();
  });

  it("keeps a durable signal and retries when synchronization fails", async () => {
    vi.useFakeTimers();
    const { source } = createSource({ generation: 8, count: 1, lastReceivedAt: 123_456 });
    const sync = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce(undefined);
    const reportError = vi.fn();
    const stop = startRealtimeSmsMonitoring({
      source,
      sync,
      reportError,
      delayMs: 1_000,
    });

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(source.acknowledgePendingSmsSignal).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(sync).toHaveBeenCalledTimes(2);
    expect(source.acknowledgePendingSmsSignal).toHaveBeenCalledTimes(1);

    stop();
  });

  it("keeps a durable signal when acknowledging it fails", async () => {
    vi.useFakeTimers();
    const { source } = createSource({ generation: 9, count: 1, lastReceivedAt: 123_456 });
    vi.mocked(source.acknowledgePendingSmsSignal).mockRejectedValueOnce(
      new Error("acknowledgement failed"),
    );
    const sync = vi.fn(async () => undefined);
    const reportError = vi.fn();
    const stop = startRealtimeSmsMonitoring({
      source,
      sync,
      reportError,
      delayMs: 1_000,
    });

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(sync).toHaveBeenCalledTimes(2);
    expect(source.acknowledgePendingSmsSignal).toHaveBeenCalledTimes(2);

    stop();
  });

  it("continues retrying with capped backoff until a durable signal succeeds", async () => {
    vi.useFakeTimers();
    const { source } = createSource({ generation: 10, count: 1, lastReceivedAt: 123_456 });
    const sync = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("failure 1"))
      .mockRejectedValueOnce(new Error("failure 2"))
      .mockRejectedValueOnce(new Error("failure 3"))
      .mockRejectedValueOnce(new Error("failure 4"))
      .mockResolvedValueOnce(undefined);
    const stop = startRealtimeSmsMonitoring({
      source,
      sync,
      reportError: vi.fn(),
      delayMs: 100,
    });

    await Promise.resolve();
    await vi.runAllTimersAsync();

    expect(sync).toHaveBeenCalledTimes(5);
    expect(source.acknowledgePendingSmsSignal).toHaveBeenCalledTimes(1);
    stop();
  });

  it("acknowledges the newest generation when arrivals are merged", async () => {
    vi.useFakeTimers();
    const { source, emit } = createSource({
      generation: 11,
      count: 1,
      lastReceivedAt: 123_456,
    });
    const sync = vi.fn(async () => undefined);
    const stop = startRealtimeSmsMonitoring({ source, sync, delayMs: 100 });

    await Promise.resolve();
    emit();
    await vi.runAllTimersAsync();

    expect(source.acknowledgePendingSmsSignal).toHaveBeenLastCalledWith(
      expect.objectContaining({ generation: 12 }),
    );
    stop();
  });

  it("removes the listener and pending timer when the app root unmounts", async () => {
    vi.useFakeTimers();
    const { source, emit } = createSource();
    const sync = vi.fn(async () => undefined);
    const stop = startRealtimeSmsMonitoring({ source, sync, delayMs: 1_000 });

    await Promise.resolve();
    emit();
    stop();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(sync).not.toHaveBeenCalled();
  });
});
