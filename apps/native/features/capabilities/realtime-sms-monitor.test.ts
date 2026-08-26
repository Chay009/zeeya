import { describe, expect, it, vi } from "vitest";

import { startRealtimeSmsMonitoring, type RealtimeSmsSignalSource } from "./realtime-sms-monitor";

function createSource(pending: { count: number; lastReceivedAt: number } | null = null) {
  let listener: ((signal: { count: number; lastReceivedAt: number }) => void) | null = null;
  const source: RealtimeSmsSignalSource = {
    consumePendingSmsSignal: vi.fn(async () => pending),
    addSmsReceivedListener(next) {
      listener = next;
      return { remove: () => (listener = null) };
    },
  };
  return { source, emit: () => listener?.({ count: 1, lastReceivedAt: Date.now() }) };
}

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
    vi.useRealTimers();
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
    vi.useRealTimers();
  });

  it("processes a durable signal captured while JavaScript was not running", async () => {
    vi.useFakeTimers();
    const { source } = createSource({ count: 2, lastReceivedAt: 123_456 });
    const sync = vi.fn(async () => undefined);
    const stop = startRealtimeSmsMonitoring({ source, sync, delayMs: 1_000 });

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sync).toHaveBeenCalledTimes(1);

    stop();
    vi.useRealTimers();
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
    vi.useRealTimers();
  });
});
