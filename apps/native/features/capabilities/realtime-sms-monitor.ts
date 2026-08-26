export interface PendingSmsSignal {
  count: number;
  lastReceivedAt: number;
}

export interface RealtimeSmsSignalSource {
  consumePendingSmsSignal(): Promise<PendingSmsSignal | null>;
  addSmsReceivedListener(listener: (signal: PendingSmsSignal) => void): { remove(): void };
}

interface RealtimeSmsMonitoringOptions {
  source: RealtimeSmsSignalSource;
  sync(): Promise<unknown>;
  reportError?(error: unknown): void;
  delayMs?: number;
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

  const run = async () => {
    if (stopped) return;
    if (running) {
      rerun = true;
      return;
    }

    running = true;
    try {
      await sync();
    } catch (error) {
      reportError(error);
    } finally {
      running = false;
      if (rerun && !stopped) {
        rerun = false;
        schedule();
      }
    }
  };

  const schedule = () => {
    if (stopped) return;
    if (running) {
      rerun = true;
      return;
    }
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, delayMs);
  };

  const subscription = source.addSmsReceivedListener(schedule);
  void source
    .consumePendingSmsSignal()
    .then((pending) => {
      if (pending && pending.count > 0) schedule();
    })
    .catch(reportError);

  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    subscription.remove();
  };
}
