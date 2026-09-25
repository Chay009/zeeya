import type { InsightsTransactionRow } from "../insights-transaction-presentation";

export type InsightsRecentTransactionsStatus = "loading" | "ready" | "error";

export interface InsightsRecentTransactionsQuery {
  direction: "income" | "expense";
  currency: string;
  limit: number;
}

export interface InsightsRecentTransactionsState {
  status: InsightsRecentTransactionsStatus;
  error: string | null;
  items: InsightsTransactionRow[];
  direction: "income" | "expense";
  currency: string;
}

export type InsightsRecentTransactionsLoader = (
  query: InsightsRecentTransactionsQuery,
) => Promise<InsightsTransactionRow[]>;
export type InsightsRecentTransactionsListener = (state: InsightsRecentTransactionsState) => void;

export interface InsightsRecentTransactionsController {
  getState(): InsightsRecentTransactionsState;
  subscribe(listener: InsightsRecentTransactionsListener): () => void;
  sync(query: InsightsRecentTransactionsQuery, revision: number): void;
  reload(query: InsightsRecentTransactionsQuery): void;
  dispose(): void;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function queryKey(query: InsightsRecentTransactionsQuery): string {
  return [query.direction, query.currency, query.limit].join(":");
}

export function createInsightsRecentTransactionsController({
  initialQuery,
  load,
}: {
  initialQuery: InsightsRecentTransactionsQuery;
  load: InsightsRecentTransactionsLoader;
}): InsightsRecentTransactionsController {
  let state: InsightsRecentTransactionsState = {
    status: "loading",
    error: null,
    items: [],
    direction: initialQuery.direction,
    currency: initialQuery.currency,
  };
  let activeKey = queryKey(initialQuery);
  let lastRevision: number | undefined;
  let requestGeneration = 0;
  let hasStarted = false;
  let disposed = false;
  const listeners = new Set<InsightsRecentTransactionsListener>();

  const publish = (next: InsightsRecentTransactionsState) => {
    state = next;
    for (const listener of listeners) listener(state);
  };

  const request = (query: InsightsRecentTransactionsQuery) => {
    if (disposed) return;
    const generation = ++requestGeneration;
    activeKey = queryKey(query);
    const directionChanged = query.direction !== state.direction;
    publish({
      status: "loading",
      error: null,
      items: directionChanged ? [] : state.items,
      direction: query.direction,
      currency: query.currency,
    });

    let result: Promise<InsightsTransactionRow[]>;
    try {
      result = load(query);
    } catch (cause) {
      if (generation !== requestGeneration || disposed) return;
      publish({
        status: "error",
        error: errorMessage(cause),
        items: [],
        direction: query.direction,
        currency: query.currency,
      });
      return;
    }

    void result.then(
      (items) => {
        if (generation !== requestGeneration || disposed) return;
        publish({
          status: "ready",
          error: null,
          items,
          direction: query.direction,
          currency: query.currency,
        });
      },
      (cause: unknown) => {
        if (generation !== requestGeneration || disposed) return;
        publish({
          status: "error",
          error: errorMessage(cause),
          items: [],
          direction: query.direction,
          currency: query.currency,
        });
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
    sync: (query, revision) => {
      if (disposed) return;
      const nextKey = queryKey(query);
      if (
        !hasStarted ||
        nextKey !== activeKey ||
        (lastRevision !== undefined && revision !== lastRevision)
      ) {
        hasStarted = true;
        lastRevision = revision;
        request(query);
      } else if (lastRevision === undefined) {
        lastRevision = revision;
      }
    },
    reload: (query) => {
      if (disposed) return;
      hasStarted = true;
      request(query);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      requestGeneration += 1;
      listeners.clear();
    },
  };
}
