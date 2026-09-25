import type { HomeReadModel, HomeReadModelQuery } from "@/lib/dashboard-data";

export type HomeReadModelStatus = "loading" | "ready" | "error";

export interface HomeReadModelState {
  status: HomeReadModelStatus;
  error: string | null;
  model: HomeReadModel | null;
  // The currency the current request was scoped to. Keeping this beside the
  // model means a caller can describe an in-flight/error request without
  // relabelling the previous successful model under a new currency.
  currency: string;
}

export type HomeReadModelLoader = (query: HomeReadModelQuery) => Promise<HomeReadModel>;
export type HomeReadModelListener = (state: HomeReadModelState) => void;

export interface HomeReadModelController {
  getState(): HomeReadModelState;
  subscribe(listener: HomeReadModelListener): () => void;
  // Starts the initial load, then refreshes the current currency whenever the
  // dashboard publishes a new projection revision. Repeating the same
  // revision is intentionally a no-op.
  sync(revision: number): void;
  // Always starts a new request, even when `currency` equals the active
  // request. Request generations provide latest-request-wins semantics for
  // both same- and different-currency overlaps.
  reload(currency: string): void;
  dispose(): void;
}

export interface CreateHomeReadModelControllerOptions {
  initialCurrency: string;
  load: HomeReadModelLoader;
  now?: () => number;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function createHomeReadModelController({
  initialCurrency,
  load,
  now = Date.now,
}: CreateHomeReadModelControllerOptions): HomeReadModelController {
  let state: HomeReadModelState = {
    status: "loading",
    error: null,
    model: null,
    currency: initialCurrency,
  };
  let currentCurrency = initialCurrency;
  let requestGeneration = 0;
  let hasStarted = false;
  let lastRevision: number | undefined;
  let disposed = false;
  const listeners = new Set<HomeReadModelListener>();

  const publish = (next: HomeReadModelState) => {
    state = next;
    for (const listener of listeners) listener(state);
  };

  const request = (currency: string) => {
    if (disposed) return;
    currentCurrency = currency;
    const generation = ++requestGeneration;
    publish({
      status: "loading",
      error: null,
      // Keep the last good snapshot on screen so a currency tap does not
      // wipe Home into a skeleton while the next scoped load is in flight.
      model: state.model,
      currency,
    });

    let result: Promise<HomeReadModel>;
    try {
      result = load({ currency, at: now() });
    } catch (cause) {
      if (generation !== requestGeneration || disposed) return;
      publish({ status: "error", error: errorMessage(cause), model: null, currency });
      return;
    }

    void result.then(
      (model) => {
        if (generation !== requestGeneration || disposed) return;
        publish({ status: "ready", error: null, model, currency });
      },
      (cause: unknown) => {
        if (generation !== requestGeneration || disposed) return;
        publish({ status: "error", error: errorMessage(cause), model: null, currency });
      },
    );
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      if (disposed) return () => undefined;
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
    sync: (revision) => {
      if (disposed) return;
      if (!hasStarted) {
        hasStarted = true;
        lastRevision = revision;
        request(currentCurrency);
        return;
      }
      // A caller can explicitly reload before the hook's first sync effect
      // runs. Treat that first observed revision as the request's baseline;
      // otherwise the sync effect would immediately duplicate the explicit
      // request solely because no revision had been recorded yet.
      if (lastRevision === undefined) {
        lastRevision = revision;
        return;
      }
      if (revision === lastRevision) return;
      lastRevision = revision;
      request(currentCurrency);
    },
    reload: (currency) => {
      if (disposed) return;
      hasStarted = true;
      request(currency);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      requestGeneration += 1;
      listeners.clear();
    },
  };
}
