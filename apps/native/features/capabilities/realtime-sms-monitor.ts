export interface PendingSmsSignal {
  generation: number;
  count: number;
  lastReceivedAt: number;
}

export interface RealtimeSmsSignalSource {
  peekPendingSmsSignal(): Promise<PendingSmsSignal | null>;
  acknowledgePendingSmsSignal(signal: PendingSmsSignal): Promise<void>;
  addSmsReceivedListener(listener: (signal: PendingSmsSignal) => void): { remove(): void };
}

interface RealtimeSmsMonitoringOptions {
  source: RealtimeSmsSignalSource;
  sync(): Promise<unknown>;
  reportError?(error: unknown): void;
  delayMs?: number;
}

const MAX_RETRY_DELAY_MS = 60_000;

function mergeSignals(current: PendingSmsSignal | null, next: PendingSmsSignal): PendingSmsSignal {
  if (!current) return next;
  if (next.generation > current.generation) return next;
  if (next.generation < current.generation) return current;
  return {
    generation: current.generation,
    count: Math.max(current.count, next.count),
    lastReceivedAt: Math.max(current.lastReceivedAt, next.lastReceivedAt),
  };
}

// SMS_RECEIVED can arrive just before the canonical inbox ContentProvider row
// becomes queryable. A short delay keeps the broadcast receiver fast while
// ensuring the existing inbox/ledger path, not an independently reconstructed
// PDU row, remains the single source of truth.
export function startRealtimeSmsMonitoring({
  source,
  sync,
  reportError = console.warn,
  delayMs = 1_000,
}: RealtimeSmsMonitoringOptions): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let rerun = false;
  let pendingSignal: PendingSmsSignal | null = null;
  let retryCount = 0;
  let retryRequested = false;

  const run = async () => {
    if (stopped) return;
    if (running) {
      rerun = true;
      return;
    }

    running = true;
    const signalToAcknowledge = pendingSignal;
    pendingSignal = null;
    try {
      await sync();
      if (signalToAcknowledge) {
        await source.acknowledgePendingSmsSignal(signalToAcknowledge);
      }
      retryCount = 0;
    } catch (error) {
      reportError(error);
      pendingSignal = signalToAcknowledge
        ? mergeSignals(pendingSignal, signalToAcknowledge)
        : pendingSignal;
      if (!stopped) {
        retryCount += 1;
        retryRequested = true;
      }
    } finally {
      running = false;
      if (retryRequested && !stopped) {
        retryRequested = false;
        rerun = false;
        schedule(undefined, true);
      } else if (rerun && !stopped) {
        rerun = false;
        schedule();
      }
    }
  };

  const schedule = (signal?: PendingSmsSignal, retry = false) => {
    if (stopped) return;
    if (signal) pendingSignal = mergeSignals(pendingSignal, signal);
    if (!retry) retryCount = 0;
    if (running) {
      rerun = true;
      return;
    }
    if (timer !== null) clearTimeout(timer);
    const retryDelay = retry
      ? Math.min(delayMs * 2 ** Math.min(Math.max(retryCount - 1, 0), 16), MAX_RETRY_DELAY_MS)
      : delayMs;
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, retryDelay);
  };

  const subscription = source.addSmsReceivedListener(schedule);
  void source
    .peekPendingSmsSignal()
    .then((pending) => {
      if (pending && pending.count > 0) schedule(pending);
    })
    .catch(reportError);

  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    subscription.remove();
  };
}
