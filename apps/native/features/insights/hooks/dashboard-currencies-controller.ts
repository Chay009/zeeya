import { normalizeCurrencyCodes } from "@/lib/currency-preference";

export type DashboardCurrenciesStatus = "loading" | "ready" | "error";

export interface DashboardCurrenciesState {
  status: DashboardCurrenciesStatus;
  error: string | null;
  currencies: string[];
}

export type DashboardCurrenciesLoader = () => Promise<string[]>;
export type DashboardCurrenciesListener = (state: DashboardCurrenciesState) => void;

export interface DashboardCurrenciesController {
  getState(): DashboardCurrenciesState;
  subscribe(listener: DashboardCurrenciesListener): () => void;
  sync(revision: number): void;
  reload(): void;
  dispose(): void;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function createDashboardCurrenciesController({
  load,
}: {
  load: DashboardCurrenciesLoader;
}): DashboardCurrenciesController {
  let state: DashboardCurrenciesState = { status: "loading", error: null, currencies: [] };
  let requestGeneration = 0;
  let lastRevision: number | undefined;
  let hasStarted = false;
  let disposed = false;
  const listeners = new Set<DashboardCurrenciesListener>();

  const publish = (next: DashboardCurrenciesState) => {
    state = next;
    for (const listener of listeners) listener(state);
  };

  const request = () => {
    if (disposed) return;
    const generation = ++requestGeneration;
    publish({ status: "loading", error: null, currencies: [] });

    let result: Promise<string[]>;
    try {
      result = load();
    } catch (cause) {
      if (generation !== requestGeneration || disposed) return;
      publish({ status: "error", error: errorMessage(cause), currencies: [] });
      return;
    }
    void result.then(
      (currencies) => {
        if (generation !== requestGeneration || disposed) return;
        publish({ status: "ready", error: null, currencies: normalizeCurrencyCodes(currencies) });
      },
      (cause: unknown) => {
        if (generation !== requestGeneration || disposed) return;
        publish({ status: "error", error: errorMessage(cause), currencies: [] });
      },
    );
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      if (disposed) return () => undefined;
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    sync: (revision) => {
      if (disposed) return;
      if (!hasStarted || (lastRevision !== undefined && revision !== lastRevision)) {
        hasStarted = true;
        lastRevision = revision;
        request();
      } else if (lastRevision === undefined) {
        // An explicit reload can happen before React runs the first sync
        // effect. Record that effect's revision as the request baseline so
        // it does not immediately issue the same request a second time.
        lastRevision = revision;
      }
    },
    reload: () => {
      if (disposed) return;
      hasStarted = true;
      request();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      requestGeneration += 1;
      listeners.clear();
    },
  };
}
