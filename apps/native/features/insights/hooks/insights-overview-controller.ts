import type { InsightsOverview, InsightsOverviewQuery } from "@/lib/dashboard-data";

export type InsightsOverviewStatus = "loading" | "ready" | "error";

export interface InsightsOverviewState {
  status: InsightsOverviewStatus;
  error: string | null;
  overview: InsightsOverview | null;
  currency: string;
  at: number;
}

export type InsightsOverviewLoader = (query: InsightsOverviewQuery) => Promise<InsightsOverview>;
export type InsightsOverviewListener = (state: InsightsOverviewState) => void;

export interface InsightsOverviewController {
  getState(): InsightsOverviewState;
  subscribe(listener: InsightsOverviewListener): () => void;
  /** Re-fetches when the query or published projection revision changes. */
  sync(query: InsightsOverviewQuery, revision: number): void;
  /** Explicitly starts a request, even when its query is unchanged. */
  reload(query: InsightsOverviewQuery): void;
  dispose(): void;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function queryKey(query: InsightsOverviewQuery): string {
  return [
    query.currency,
    query.at,
    query.dailyBudgetMinorUnits ?? "none",
    query.historyMonths ?? "default",
    query.limit ?? "default",
  ].join(":");
}

export function createInsightsOverviewController({
  initialQuery,
  load,
}: {
  initialQuery: InsightsOverviewQuery;
  load: InsightsOverviewLoader;
}): InsightsOverviewController {
  let state: InsightsOverviewState = {
    status: "loading",
    error: null,
    overview: null,
    currency: initialQuery.currency,
    at: initialQuery.at,
  };
  let activeKey = queryKey(initialQuery);
  let lastRevision: number | undefined;
  let requestGeneration = 0;
  let hasStarted = false;
  let disposed = false;
  const listeners = new Set<InsightsOverviewListener>();

  const publish = (next: InsightsOverviewState) => {
    state = next;
    for (const listener of listeners) listener(state);
  };

  const request = (query: InsightsOverviewQuery) => {
    if (disposed) return;
    const generation = ++requestGeneration;
    activeKey = queryKey(query);
    publish({
      status: "loading",
      error: null,
      overview: state.overview,
      currency: query.currency,
      at: query.at,
    });

    let result: Promise<InsightsOverview>;
    try {
      result = load(query);
    } catch (cause) {
      if (generation !== requestGeneration || disposed) return;
      publish({
        status: "error",
        error: errorMessage(cause),
        overview: null,
        currency: query.currency,
        at: query.at,
      });
      return;
    }

    void result.then(
      (overview) => {
        if (generation !== requestGeneration || disposed) return;
        publish({
          status: "ready",
          error: null,
          overview,
          currency: query.currency,
          at: query.at,
        });
      },
      (cause: unknown) => {
        if (generation !== requestGeneration || disposed) return;
        publish({
          status: "error",
          error: errorMessage(cause),
          overview: null,
          currency: query.currency,
          at: query.at,
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
        // An explicit reload can happen before React runs the first sync
        // effect. Record that effect's revision as the request baseline so
        // it does not immediately issue the same request a second time.
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
