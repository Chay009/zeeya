import type { HomeHighlights, HomeHighlightsQuery } from "@/lib/dashboard-data";

export type HomeHighlightsStatus = "loading" | "ready" | "error";

export interface HomeHighlightsState {
  status: HomeHighlightsStatus;
  error: string | null;
  highlights: HomeHighlights | null;
  currency: string;
  at: number;
  accountId: string | undefined;
}

export type HomeHighlightsLoader = (query: HomeHighlightsQuery) => Promise<HomeHighlights>;
export type HomeHighlightsListener = (state: HomeHighlightsState) => void;

export interface HomeHighlightsController {
  getState(): HomeHighlightsState;
  subscribe(listener: HomeHighlightsListener): () => void;
  /** Re-fetches when the query or published projection revision changes. */
  sync(query: HomeHighlightsQuery, revision: number): void;
  /** Explicitly starts a request, even when its query is unchanged. */
  reload(query: HomeHighlightsQuery): void;
  dispose(): void;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function queryKey(query: HomeHighlightsQuery): string {
  return [
    query.currency,
    query.at,
    query.accountId ?? "all-accounts",
    query.recentLimit ?? "default",
    query.upcomingLimit ?? "default",
  ].join(":");
}

export function createHomeHighlightsController({
  initialQuery,
  load,
}: {
  initialQuery: HomeHighlightsQuery;
  load: HomeHighlightsLoader;
}): HomeHighlightsController {
  let state: HomeHighlightsState = {
    status: "loading",
    error: null,
    highlights: null,
    currency: initialQuery.currency,
    at: initialQuery.at,
    accountId: initialQuery.accountId,
  };
  let activeKey = queryKey(initialQuery);
  let lastRevision: number | undefined;
  let requestGeneration = 0;
  let hasStarted = false;
  let disposed = false;
  const listeners = new Set<HomeHighlightsListener>();

  const publish = (next: HomeHighlightsState) => {
    state = next;
    for (const listener of listeners) listener(state);
  };

  const request = (query: HomeHighlightsQuery) => {
    if (disposed) return;
    const generation = ++requestGeneration;
    activeKey = queryKey(query);
    publish({
      status: "loading",
      error: null,
      // Keep the last snapshot visible while a new account scope loads — same
      // stale-while-revalidate pattern as pull-to-refresh.
      highlights: state.highlights,
      currency: query.currency,
      at: query.at,
      accountId: query.accountId,
    });

    let result: Promise<HomeHighlights>;
    try {
      result = load(query);
    } catch (cause) {
      if (generation !== requestGeneration || disposed) return;
      publish({
        status: "error",
        error: errorMessage(cause),
        highlights: null,
        currency: query.currency,
        at: query.at,
        accountId: query.accountId,
      });
      return;
    }

    void result.then(
      (highlights) => {
        if (generation !== requestGeneration || disposed) return;
        publish({
          status: "ready",
          error: null,
          highlights,
          currency: query.currency,
          at: query.at,
          accountId: query.accountId,
        });
      },
      (cause: unknown) => {
        if (generation !== requestGeneration || disposed) return;
        publish({
          status: "error",
          error: errorMessage(cause),
          highlights: null,
          currency: query.currency,
          at: query.at,
          accountId: query.accountId,
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
